/**
 * Docs site — sidebar navigation tests.
 *
 * Verifies that sidebar links navigate to the correct pages
 * and that pages render content.
 */

describe("Docs site sidebar", () => {
  beforeEach(() => {
    cy.visit("/getting-started");
  });

  it("has all eight sidebar sections", () => {
    const sections = [
      "Getting Started",
      "Server & API",
      "Data",
      "Rendering & Streaming",
      "Forms & Actions",
      "Security",
      "Testing & Tooling",
      "Background & Design",
    ];

    sections.forEach((section) => {
      cy.get(".VPSidebar").contains(section).should("exist");
    });
  });

  it("navigates to Architecture via the sidebar", () => {
    cy.get(".VPSidebar").contains("a", "Architecture").click();
    cy.url().should("include", "/architecture");
    cy.get("h1").should("exist");
  });

  it("navigates to Security via the sidebar", () => {
    cy.get(".VPSidebar").contains("a", "Security").click();
    cy.url().should("include", "/security");
    cy.get("h1").should("exist");
  });

  it("navigates to API Design via the sidebar", () => {
    cy.get(".VPSidebar").contains("a", "API Design").click();
    cy.url().should("include", "/api-design");
    cy.get("h1").should("exist");
  });
});
