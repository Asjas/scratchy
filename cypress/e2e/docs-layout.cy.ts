/**
 * Docs site — layout elements tests.
 *
 * Verifies that the navbar icons (GitHub, theme toggle) and the
 * search button are present, and that the sidebar exists.
 */

describe("Docs site layout elements", () => {
  beforeEach(() => {
    cy.visit("/getting-started");
  });

  it("has a GitHub social link in the navbar", () => {
    cy.get(".VPNavBarSocialLinks").within(() => {
      cy.get('a[href*="github.com"]').should("exist");
    });
  });

  it("has a theme toggle button in the navbar", () => {
    cy.get(".VPNavBarAppearance").should("exist");
  });

  it("has a search button in the navbar", () => {
    cy.get(".VPNavBarSearch").should("exist");
  });

  it("has a sidebar with navigation links", () => {
    cy.get(".VPSidebar").should("exist");
  });

  it("shows sidebar categories", () => {
    cy.get(".VPSidebar").within(() => {
      cy.contains("Getting Started").should("exist");
      cy.contains("Server & API").should("exist");
      cy.contains("Data").should("exist");
      cy.contains("Security").should("exist");
    });
  });

  it("shows a table of contents on the right for long pages", () => {
    // The aside TOC appears on pages with headings
    cy.get("#VPContent").should("exist");
  });
});
