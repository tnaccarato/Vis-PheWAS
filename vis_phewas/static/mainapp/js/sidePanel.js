let activeTab = null;

/**
 * Function to toggle the side panel.
 * @param {string} tab - The tab to toggle.
 */
function toggleSidePanel(tab) {
  const sidePanel = document.getElementById("side-panel");
  const isOpen = sidePanel.classList.contains("open");

  if (isOpen && activeTab === tab) {
    closeSidePanel();
    return;
  }

  // Either open the panel or switch tabs
  openSidePanel(tab);
}

/**
 * Function to close the side panel.
 */
function closeSidePanel() {
  const sidePanel = document.getElementById("side-panel");
  const tabs = document.querySelectorAll(".tab");
  sidePanel.classList.remove("open");
  tabs.forEach((t) => t.classList.remove("open"));
  activeTab = null;
}

/**
 * Function to open the side panel and update the contents.
 * @param {string} tab - The tab to update the contents for.
 */
function openSidePanel(tab) {
  const sidePanel = document.getElementById("side-panel");
  const tabs = document.querySelectorAll(".tab");
  sidePanel.classList.add("open");
  tabs.forEach((t) => t.classList.add("open"));

  updateSidebarContents(tab);
  activeTab = tab;
}

/**
 * Function to update the sidebar contents.
 * @param {string} tab - The tab to update the contents for.
 */
function updateSidebarContents(tab) {
  const sidePanelContent = document.querySelector(".side-panel-content");
  sidePanelContent.innerHTML = ""; // Clear the existing content

  if (tab === "options") {
    const optionsPanel = document.getElementById("options-panel");
    if (optionsPanel) {
      sidePanelContent.innerHTML = optionsPanel.innerHTML;
      window.updateCheckboxState(); // Ensure checkbox state is updated when options are loaded
    }
  } else if (tab === "help") {
    const helpPanel = document.getElementById("help-panel");
    if (helpPanel) {
      sidePanelContent.innerHTML = helpPanel.innerHTML;
    }
  } else if (tab === "tools") {
    const toolsPanel = document.getElementById("tools-panel");
    if (toolsPanel) {
      sidePanelContent.innerHTML = toolsPanel.innerHTML;
    }
  }
}
