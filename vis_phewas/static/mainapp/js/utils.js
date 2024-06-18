import {filters, push_filters} from "./filter";

export function closeInfoContainer(adjustSigmaContainerHeight) {
    return function () {
        const leftColumn = document.getElementsByClassName('col-md-6 left-column')[0]
        leftColumn.style.width = '100%';
        // Resize the Sigma container
        adjustSigmaContainerHeight();
        const rightColumn = document.getElementsByClassName('col-md-6 right-column')[0]
        rightColumn.style.display = 'none';
        const infoPanel = document.getElementsByClassName('info-container')[0];
        infoPanel.style.display = 'none';
    };
}

export function getExportData(showAlert) {
    // Push filters to the filters array to make sure the filters are applied
    push_filters();
    console.log('Filters:', filters); // Debugging log

    // If filters is empty, set it to an empty array
    if (!filters) {
        filters = [];
    }

    // Construct the query string
    const query = new URLSearchParams({filters: filters}).toString();
    // Construct the URL from which to fetch the data
    const url = '/api/export-query/' + (query ? '?' + query : '');

    // Fetch the data from the URL
    fetch(url)
        // Get the response as a blob
        .then(response => {
            console.log(url)
            // Get the dataset length from the response headers
            const length = response.headers.get('Dataset-Length');
            if (length === '0') {
                showAlert('No data to export');
                return;
            }
            // Construct the alert message
            const filtersDisplay = filters.length > 0 ? filters.join(', ') : 'None';
            const alertMessage = `Exporting Data...<br><b>Filters selected:</b> ${filtersDisplay}<br><b>Dataset length:</b> ${length}`;
            showAlert(alertMessage);
            // Return the response as a blob object
            return response.blob();
        })
        // Convert the blob to a URL and download the file
        .then(blob => {
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = 'exported_data.csv';
            document.body.appendChild(a);
            a.click();
            a.remove();
        })
        // Log any errors to the console
        .catch(error => console.error('Error:', error));
}

export function getShowAlert(message) {
    // Get the alert container
    const alertContainer = document.getElementById('alert-container');
    // Set the inner HTML of the alert container
    alertContainer.innerHTML = `
        <div class="alert alert-info alert-dismissible fade show" role="alert" style="margin: 0">
            ${message}
            <button type="button" class="btn-close align-center" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>
    `;
}

export function getAdjustSigmaContainer(container, sigmaInstance) {
    const filtersContainer = document.getElementById('filters-container');
    const filtersHeight = filtersContainer.offsetHeight;

    container.style.height = `calc(100% - ${filtersHeight}px)`;
    sigmaInstance.refresh();
}