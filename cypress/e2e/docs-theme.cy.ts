/**
 * Docs site — dark mode / light mode theme toggle tests.
 *
 * VitePress stores the colour scheme in localStorage as
 * `vitepress-theme-appearance` and sets the `dark` class on
 * the <html> element. We verify that the toggle switches between
 * the two modes correctly.
 */

describe("Docs site theme toggle", () => {
  beforeEach(() => {
    // Start each test in light mode
    cy.visit("/getting-started", {
      onBeforeLoad(win) {
        win.localStorage.setItem("vitepress-theme-appearance", "light");
      },
    });
  });

  it("starts in light mode when localStorage is set to light", () => {
    cy.get("html").should("not.have.class", "dark");
  });

  it("switches to dark mode when the theme toggle is clicked", () => {
    cy.get(".VPNavBarAppearance button").click();
    cy.get("html").should("have.class", "dark");
  });

  it("switches back to light mode on a second click", () => {
    cy.get(".VPNavBarAppearance button").click();
    cy.get("html").should("have.class", "dark");
    cy.get(".VPNavBarAppearance button").click();
    cy.get("html").should("not.have.class", "dark");
  });

  it("persists the theme preference across page loads", () => {
    cy.get(".VPNavBarAppearance button").click();
    cy.get("html").should("have.class", "dark");

    cy.reload();
    cy.get("html").should("have.class", "dark");
  });
});
