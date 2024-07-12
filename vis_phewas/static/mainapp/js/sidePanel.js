let showSubtypes = false;
let activeTab = null;

// Function to toggle the side panel
function toggleSidePanel(tab) {
    const sidePanel = document.getElementById('side-panel');
    const isOpen = sidePanel.classList.contains('open');

    // If the same tab is clicked, close the panel
    if (isOpen && activeTab === tab) {
        sidePanel.classList.remove('open');
        const tabs = document.querySelectorAll('.tab');
        tabs.forEach(t => t.classList.remove('open'));
        activeTab = null;
        return;
    }

    // If the panel is not open, open it
    if (!isOpen) {
        sidePanel.classList.add('open');
        const tabs = document.querySelectorAll('.tab');
        tabs.forEach(t => t.classList.add('open'));
    }

    // Update the sidebar contents based on the clicked tab
    updateSidebarContents(tab);
    activeTab = tab;
}

// Function to update the sidebar contents
function updateSidebarContents(tab) {
    const sidePanelContent = document.querySelector('.side-panel-content');
    // Clear the sidebar content
    sidePanelContent.innerHTML = '';
    if (tab === 'options') {
        sidePanelContent.innerHTML = document.getElementById('options-panel').innerHTML;
        const showSubtypesSwitch = document.getElementById('show-subtypes-switch');
        showSubtypesSwitch.checked = showSubtypes;
    } else if (tab === 'help') {
        sidePanelContent.innerHTML = document.getElementById('help-panel').innerHTML;
    }
}
