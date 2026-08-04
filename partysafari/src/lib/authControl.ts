export type AuthControlState = {
  loading: boolean;
  userId: string | null;
  signingOut: boolean;
  error: string | null;
};

export type AuthControlAction =
  | { type: "session:loading" }
  | { type: "session:resolved"; userId: string | null }
  | { type: "auth:changed"; userId: string | null }
  | { type: "signout:requested" }
  | { type: "signout:succeeded" }
  | { type: "signout:failed"; message: string }
  | { type: "error:cleared" };

export type AuthControlView = {
  loading: boolean;
  signedIn: boolean;
  signedOut: boolean;
  signingOut: boolean;
  label: "Sign In" | "Sign Out" | "Signing out..." | "Checking session...";
  error: string | null;
};

export const INITIAL_AUTH_CONTROL_STATE: AuthControlState = {
  loading: true,
  userId: null,
  signingOut: false,
  error: null,
};

export function reduceAuthControlState(state: AuthControlState, action: AuthControlAction): AuthControlState {
  switch (action.type) {
    case "session:loading":
      return { ...state, loading: true, error: null };
    case "session:resolved":
      return {
        loading: false,
        userId: action.userId,
        signingOut: false,
        error: null,
      };
    case "auth:changed":
      return {
        loading: false,
        userId: action.userId,
        signingOut: action.userId ? state.signingOut : false,
        error: action.userId ? state.error : null,
      };
    case "signout:requested":
      if (!state.userId || state.signingOut) {
        return state;
      }
      return {
        ...state,
        signingOut: true,
        error: null,
      };
    case "signout:succeeded":
      return {
        loading: false,
        userId: null,
        signingOut: false,
        error: null,
      };
    case "signout:failed":
      return {
        ...state,
        signingOut: false,
        error: action.message,
      };
    case "error:cleared":
      return { ...state, error: null };
    default:
      return state;
  }
}

export function toAuthControlView(state: AuthControlState): AuthControlView {
  const signedIn = Boolean(state.userId);
  const signedOut = !state.loading && !signedIn;

  let label: AuthControlView["label"] = "Checking session...";
  if (state.loading) {
    label = "Checking session...";
  } else if (state.signingOut) {
    label = "Signing out...";
  } else if (signedIn) {
    label = "Sign Out";
  } else {
    label = "Sign In";
  }

  return {
    loading: state.loading,
    signedIn,
    signedOut,
    signingOut: state.signingOut,
    label,
    error: state.error,
  };
}

export function toAuthErrorMessage(cause: unknown): string {
  if (typeof cause === "object" && cause !== null && "message" in cause) {
    const message = (cause as { message?: unknown }).message;
    if (typeof message === "string" && message.trim().length > 0) {
      return message.trim();
    }
  }
  return "Could not sign out right now.";
}

export function createSingleFlightTask<T>(task: () => Promise<T>) {
  let inFlight: Promise<T> | null = null;

  return async () => {
    if (inFlight) {
      return inFlight;
    }

    inFlight = task().finally(() => {
      inFlight = null;
    });

    return inFlight;
  };
}