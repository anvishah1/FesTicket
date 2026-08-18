import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import EventMap from "@/components/EventMap";
import { THEME_EVENT } from "@/lib/theme";

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-theme");
});

// The venue map used to stay light-tiled regardless of the app's theme —
// OSM's raster tiles have no dark variant, so components/EventMap.tsx applies
// a CSS filter (globals.css: .map-dark-tiles) to the tile pane only when dark.
describe("EventMap dark-mode treatment", () => {
  it("does not apply the dark-tiles class in light mode", () => {
    document.documentElement.setAttribute("data-theme", "light");
    const { container } = render(<EventMap lat={10} lng={20} />);
    // The class lives on the wrapper div (see EventMap.tsx), not on
    // react-leaflet's own .leaflet-container, which doesn't reactively sync
    // a className prop change after its initial mount.
    expect(container.firstElementChild?.className).not.toContain("map-dark-tiles");
  });

  it("applies the dark-tiles class when the app is in dark mode", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    const { container } = render(<EventMap lat={10} lng={20} />);
    expect(container.firstElementChild?.className).toContain("map-dark-tiles");
  });

  it("reacts to a same-tab theme toggle without needing a remount", () => {
    document.documentElement.setAttribute("data-theme", "light");
    const { container } = render(<EventMap lat={10} lng={20} />);
    expect(container.firstElementChild?.className).not.toContain("map-dark-tiles");

    act(() => {
      document.documentElement.setAttribute("data-theme", "dark");
      window.dispatchEvent(new Event(THEME_EVENT));
    });

    expect(container.firstElementChild?.className).toContain("map-dark-tiles");
  });
});
