import {closeInfoContainer} from "./utils";

export let filterCount = 0;
export let filters = [];

export function push_filters() {
    filters = [];
    const filterGroups = document.querySelectorAll('.filter-group');
    console.log('Filter groups:', filterGroups); // Debugging log

    filterGroups.forEach(group => {
        const select = group.querySelector('select');

        const operatorSelect = group.querySelector('.operator-select');
        const input = group.querySelector('.field-input');
        // If input is empty, skip the filter
        if (input.value === '') {
            return;
        }
        console.log('Test')
        console.log('Select:', select); // Debugging log
        console.log('Operator select:', operatorSelect); // Debugging log
        console.log('Input:', input); // Debugging log
        if (select && input) {
            filters.push(`${select.value}:${operatorSelect ? operatorSelect.value : '=='}:${input.value.toLowerCase()}`);
        }
        console.log('Filters:', filters); // Debugging log
    });
}

export function getClearFilters(adjustSigmaContainerHeight, showAlert, fetchGraphData) {
    return function () {
        filters = [];
        const filterGroups = document.querySelectorAll('.filter-group');
        filterGroups.forEach(group => {
            group.remove();
        });
        filterCount = 0;
        // Clear the info container
        closeInfoContainer(adjustSigmaContainerHeight)();
        // Hide the toolbar
        const toolbar = document.getElementsByClassName('toolbar')[0];
        toolbar.style.display = 'none';
        // Display an alert message for confirmation of filters cleared
        showAlert('Filters cleared. Showing all data.');
        fetchGraphData();
    };
}

export function getUpdateFilterInput(adjustSigmaContainerHeight) {
    return function (select) {
        const filterInputContainer = select.parentNode.querySelector('#filter-input-container');
        const selectedField = select.value;

        // Clear the input container
        filterInputContainer.innerHTML = '';
        console.log('Selected field:', selectedField); // Debugging log

        // Add the appropriate input element based on the selected field
        if (['snp', 'phewas_code', 'phewas_string', 'category_string', 'serotype', 'subtype'].includes(selectedField)) {
            const operator = document.createElement('select');
            operator.innerHTML = `
            <option value="==">Exactly</option>
            <option value="contains">Contains</option>
            `;
            operator.className = 'operator-select';
            filterInputContainer.appendChild(operator);
            const input = document.createElement('input');
            input.type = 'text';
            input.placeholder = 'Enter value';
            input.className = 'field-input';
            filterInputContainer.appendChild(input);

        } else if (['cases', 'controls', 'p', 'odds_ratio', 'l95', 'u95', 'maf'].includes(selectedField)) {
            const operator = document.createElement('select');
            operator.innerHTML = `
            <option value=">">\> (Greater than)</option>
            <option value="<">\< (Less than)</option>
            <option value=">=">>\=(Greater than or equal to)</option>
            <option value="<="><\=(Less than or equal to)</option>
        `;
            operator.className = 'operator-select';
            filterInputContainer.appendChild(operator);
            const input = document.createElement('input');
            input.type = 'float';
            input.placeholder = 'Enter value';
            input.className = 'field-input';
            filterInputContainer.appendChild(input);
        } else if (['gene_class', 'gene_name', 'a1', 'a2'].includes(selectedField)) {
            const select = document.createElement('select');
            select.className = 'field-input';
            if (selectedField === 'gene_class') {
                select.innerHTML = `
            <option value="1">Class 1</option>
            <option value="2">Class 2</option>
            `;
            } else if (selectedField === 'gene_name') {
                select.innerHTML = `
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
            <option value="DPA1">DPA1</option>
            <option value="DPB1">DPB1</option>
            <option value="DQA1">DQA1</option>
            <option value="DQB1">DQB1</option>
            <option value="DRB1">DRB1</option>
            `;
            } else {
                select.innerHTML = `
                <option value="A">A</option>
                <option value="P">P</option>
                `;
            }
            filterInputContainer.appendChild(select);

        }


        adjustSigmaContainerHeight();
    };
}

export function getAddFilter(adjustSigmaContainerHeight) {
    return function () {
        console.log('Filter count:', filterCount); // Debugging log
        // Show the toolbar if it is hidden
        const toolbar = document.getElementsByClassName('toolbar')[0];
        toolbar.style.display = 'block';
        if (filterCount >= 8) {
            alert('Maximum of 8 filters allowed');
        } else {
            const filterGroup = document.createElement('div');
            filterGroup.className = 'filter-group';

            const select = document.createElement('select');
            select.className = 'field-select';
            select.onchange = function () {
                updateFilterInput(select);
            };
            select.innerHTML = `
            <option value="snp">SNP</option>
            <option value="gene_class">Gene Class</option>
            <option value="gene_name">HLA Type</option>
            <option value="serotype">Serotype</option>
            <option value="subtype">Subtype</option>
            <option value="phewas_code">Phecode</option>
            <option value="phewas_string">Phenotype</option>
            <option value="category_string">Disease Category</option>
            <option value="cases">Number of Cases</option>
            <option value="controls">Number of Controls</option>
            <option value="p">P-Value</option>
            <option value="odds_ratio">Odds Ratio</option>
            <option value="l95">95% CI Lower Bound</option>
            <option value="u95">95% CI Upper Bound</option>
            <option value="maf">Minor Allele Frequency</option>
            <option value="a1">Allele 1</option>
            <option value="a2">Allele 2</option>
        `;
            filterGroup.appendChild(select);

            const filterInputContainer = document.createElement('div');
            filterInputContainer.id = 'filter-input-container';
            filterGroup.appendChild(filterInputContainer);

            const minusButton = document.createElement('button');
            minusButton.className = 'btn btn-danger';
            minusButton.textContent = '-';
            minusButton.onclick = function () {
                removeFilter(minusButton);
            };
            filterGroup.appendChild(minusButton);

            document.getElementById('filters-container').appendChild(filterGroup);

            // Gets content of the filter group
            window.updateFilterInput(select);

            // Adjust the width of the Sigma container
            adjustSigmaContainerHeight();

            filterCount++;
            console.log(filterCount);
        }
    };
}

export function getRemoveFilter(adjustSigmaContainerHeight) {
    return function (button) {
        const filterGroup = button.parentNode;
        filterGroup.remove();

        adjustSigmaContainerHeight();
        filterCount--;
    };
}

export function getApplyFilters(showAlert, fetchGraphData, sigmaInstance) {
    return function () {
        push_filters();
        // Display a dismissible alert message for confirmation of filters applied
        const message = filters.length > 0 ? `Applying filters: ${filters.join(', ')}` : 'No filters applied';
        showAlert(message);

        console.log('Filters:', filters); // Debugging log

        fetchGraphData({type: 'initial', filters});

        sigmaInstance.refresh();

    };
}