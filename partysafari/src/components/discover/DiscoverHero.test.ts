import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import DiscoverHero from "@/components/discover/DiscoverHero";

function render() {
  return renderToStaticMarkup(
    createElement(DiscoverHero, {
      peopleOutTonight: 120,
      liveEvents: 14,
      activeStories: 31,
      trendingVenues: 9,
      updatedLabel: "Updated just now",
    })
  );
}

test("hero primary action is View Crowd Pulse and routes to /map", () => {
  const markup = render();
  assert.equal(markup.includes("View Crowd Pulse"), true);
  assert.equal(markup.includes('href="/map"'), true);
});

test("legacy Open Live Map wording is absent", () => {
  const markup = render();
  assert.equal(markup.includes("Open Live Map"), false);
});
