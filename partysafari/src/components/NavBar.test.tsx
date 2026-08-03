import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NavBar from "@/components/NavBar";

const replaceMock = vi.fn();
const refreshMock = vi.fn();
const getSessionMock = vi.fn();
const signOutMock = vi.fn();

let authStateCallback: ((event: string, session: Session | null) => void) | null = null;

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: replaceMock,
    refresh: refreshMock,
    push: vi.fn(),
  }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/NotificationCenter", () => ({
  default: () => <div data-testid="notification-center">Notifications</div>,
}));

vi.mock("@/lib/friendSync", () => ({
  FRIEND_STATE_SYNC_EVENT: "partysafari:friend-state-sync",
}));

vi.mock("@/lib/runtimeKillSwitch", () => ({
  TEMP_KILL_SWITCH: {
    disableSupabaseRealtime: true,
  },
}));

const friendRequestsQuery = {
  select: vi.fn(),
  eq: vi.fn(),
};

friendRequestsQuery.select.mockImplementation(() => friendRequestsQuery);
friendRequestsQuery.eq.mockImplementation((column: string) => {
  if (column === "status") {
    return Promise.resolve({ count: 0 });
  }
  return friendRequestsQuery;
});

const mockSupabase = {
  auth: {
    getSession: getSessionMock,
    signOut: signOutMock,
    onAuthStateChange: vi.fn((callback: (event: string, session: Session | null) => void) => {
      authStateCallback = callback;
      return {
        data: {
          subscription: {
            unsubscribe: vi.fn(),
          },
        },
      };
    }),
  },
  rpc: vi.fn(async () => ({ data: [], error: null })),
  from: vi.fn((table: string) => {
    if (table === "friend_requests") {
      return friendRequestsQuery;
    }

    return {
      select: vi.fn(() => Promise.resolve({ count: 0 })),
    };
  }),
  channel: vi.fn(),
  removeChannel: vi.fn(),
};

vi.mock("@/lib/supabaseClient", () => ({
  createSupabaseBrowser: () => mockSupabase,
}));

function buildSession(userId = "user-1") {
  return {
    access_token: "token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: 9999999999,
    refresh_token: "refresh",
    user: {
      id: userId,
      app_metadata: {},
      user_metadata: {},
      aud: "authenticated",
      created_at: "2026-08-03T00:00:00.000Z",
    },
  } as unknown as Session;
}

describe("NavBar sign out flow", () => {
  beforeEach(() => {
    replaceMock.mockReset();
    refreshMock.mockReset();
    getSessionMock.mockReset();
    signOutMock.mockReset();
    mockSupabase.rpc.mockClear();
    mockSupabase.from.mockClear();
    friendRequestsQuery.select.mockClear();
    friendRequestsQuery.eq.mockClear();
    authStateCallback = null;

    getSessionMock.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    signOutMock.mockResolvedValue({ error: null });
  });

  it("hides Sign Out when user is signed out", async () => {
    render(<NavBar />);

    await waitFor(() => {
      expect(screen.getAllByRole("link", { name: "Log In" }).length).toBeGreaterThan(0);
    });

    expect(screen.queryByRole("button", { name: "Sign out of your account" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("notification-center")).not.toBeInTheDocument();
  });

  it("shows Sign Out when user is authenticated", async () => {
    getSessionMock.mockResolvedValue({
      data: { session: buildSession() },
      error: null,
    });

    render(<NavBar />);

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "Sign out of your account" }).length).toBeGreaterThan(0);
    });

    expect(screen.getByTestId("notification-center")).toBeInTheDocument();
  });

  it("calls supabase signOut exactly once and disables button while signing out", async () => {
    getSessionMock.mockResolvedValue({
      data: { session: buildSession() },
      error: null,
    });

    let resolveSignOut: (value: { error: null }) => void = () => undefined;
    signOutMock.mockImplementation(
      () =>
        new Promise<{ error: null }>((resolve) => {
          resolveSignOut = resolve;
        })
    );

    render(<NavBar />);
    const user = userEvent.setup();

    const [button] = await screen.findAllByRole("button", { name: "Sign out of your account" });
    await user.click(button);

    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("Signing out...");

    resolveSignOut({ error: null });

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/login");
    });
  });

  it("redirects to login and refreshes UI after successful sign out", async () => {
    getSessionMock.mockResolvedValue({
      data: { session: buildSession() },
      error: null,
    });

    render(<NavBar />);
    const user = userEvent.setup();

    const [button] = await screen.findAllByRole("button", { name: "Sign out of your account" });
    await user.click(button);

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/login");
      expect(refreshMock).toHaveBeenCalled();
    });

    expect(screen.queryByTestId("notification-center")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign out of your account" })).not.toBeInTheDocument();
  });

  it("shows an error and does not redirect when sign out fails", async () => {
    getSessionMock.mockResolvedValue({
      data: { session: buildSession() },
      error: null,
    });
    signOutMock.mockResolvedValue({
      error: { message: "network failed" },
    });

    render(<NavBar />);
    const user = userEvent.setup();

    const [button] = await screen.findAllByRole("button", { name: "Sign out of your account" });
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText("Unable to sign out right now. Please try again.")).toBeInTheDocument();
    });

    expect(replaceMock).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
    const [stillVisibleButton] = screen.getAllByRole("button", { name: "Sign out of your account" });
    expect(stillVisibleButton).toBeEnabled();
  });

  it("removes authenticated controls on SIGNED_OUT auth state change", async () => {
    getSessionMock.mockResolvedValue({
      data: { session: buildSession() },
      error: null,
    });

    render(<NavBar />);

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "Sign out of your account" }).length).toBeGreaterThan(0);
    });

    await act(async () => {
      authStateCallback?.("SIGNED_OUT", null);
    });

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Sign out of your account" })).not.toBeInTheDocument();
      expect(screen.queryByTestId("notification-center")).not.toBeInTheDocument();
    });
  });

  it("does not enable AI Discover controls during sign out", async () => {
    getSessionMock.mockResolvedValue({
      data: { session: buildSession() },
      error: null,
    });

    render(<NavBar />);
    const user = userEvent.setup();

    const [button] = await screen.findAllByRole("button", { name: "Sign out of your account" });
    await user.click(button);

    expect(screen.queryByText(/AI Discover/i)).not.toBeInTheDocument();
  });
});
