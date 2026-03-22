/**
 * Docs site — navigation and page existence tests.
 *
 * Verifies that all three top-level nav destinations load correctly
 * and that key structural elements are present on each page.
 */

describe("Docs site navigation", () => {
  beforeEach(() => {
    cy.visit("/getting-started");
  });

  it("loads the Getting Started page", () => {
    cy.url().should("include", "/getting-started");
    cy.get("h1").should("exist");
  });

  it("has a navbar with the site title", () => {
    cy.get(".VPNavBar").should("exist");
    cy.get(".VPNavBar").should("contain.text", "Scratchy.js Framework");
  });

  it("has Docs, Changelog, and Releases nav links", () => {
    cy.get(".VPNavBarMenu").within(() => {
      cy.contains("a", "Docs").should("exist");
      cy.contains("a", "Changelog").should("exist");
      cy.contains("a", "Releases").should("exist");
    });
  });

  it("navigates to the Changelog page", () => {
    cy.get(".VPNavBarMenu").contains("a", "Changelog").click();
    cy.url().should("include", "/changelog");
    cy.get("h1").should("contain.text", "Changelog");
  });

  it("navigates to the Releases page", () => {
    cy.get(".VPNavBarMenu").contains("a", "Releases").click();
    cy.url().should("include", "/releases");
    cy.get("h1").should("contain.text", "Releases");
  });

  it("navigates back to docs from Changelog", () => {
    cy.get(".VPNavBarMenu").contains("a", "Changelog").click();
    cy.get(".VPNavBarMenu").contains("a", "Docs").click();
    cy.url().should("include", "/getting-started");
  });
});
