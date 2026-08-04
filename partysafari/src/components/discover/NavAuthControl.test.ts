import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NavAuthControl } from "@/components/NavBar";

function render(input: {
  loading: boolean;
  signedIn: boolean;
  signingOut: boolean;
  error: string | null;
}) {
  return renderToStaticMarkup(
    createElement(NavAuthControl, {
      ...input,
      onSignIn: () => undefined,
      onSignOut: () => undefined,
    })
  );
}

test("signed-out control renders Sign In", () => {
  const markup = render({ loading: false, signedIn: false, signingOut: false, error: null });
  assert.match(markup, />Sign In</);
  assert.equal(markup.includes("Sign Out"), false);
});

test("signed-in control renders Sign Out", () => {
  const markup = render({ loading: false, signedIn: true, signingOut: false, error: null });
  assert.match(markup, />Sign Out</);
  assert.equal(markup.includes("Sign In"), false);
});

test("signing-out control is disabled and busy", () => {
  const markup = render({ loading: false, signedIn: true, signingOut: true, error: null });
  assert.match(markup, />Signing out\.\.\.</);
  assert.match(markup, /disabled=""/);
  assert.match(markup, /aria-busy="true"/);
});

test("auth error is announced in the control", () => {
  const markup = render({ loading: false, signedIn: true, signingOut: false, error: "Could not sign out right now." });
  assert.match(markup, /aria-live="polite"/);
  assert.match(markup, /Could not sign out right now\./);
});