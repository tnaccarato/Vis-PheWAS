import Graph from 'graphology';
import {Sigma} from 'sigma';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import {rgbaToFloat} from "sigma/utils";

let filterCount = 0;
let filters = [];

// Ensure the DOM is loaded
document.addEventListener('DOMContentLoaded', function () {
    // Define the filter logic functions
    window.updateFilterInput = function (select) {
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
            <option value="==">== (Equal to)</option>
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

    window.addFilter = function () {
        console.log('Filter count:', filterCount); // Debugging log
        if (filterCount >= 8) {
            alert('Maximum of 8 filters allowed');
        } else {
            const filterGroup = document.createElement('div');
            filterGroup.className = 'filter-group';

            const label = document.createElement('label');
            label.textContent = 'Field:';
            filterGroup.appendChild(label);

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


// Function to remove a filter
    window.removeFilter = function (button) {
        const filterGroup = button.parentNode;
        filterGroup.remove();

        adjustSigmaContainerHeight();
        filterCount--;
    }


// Function to adjust the width of the Sigma container
    function adjustSigmaContainerHeight() {
        const filtersContainer = document.getElementById('filters-container');
        const filtersHeight = filtersContainer.offsetHeight;

        container.style.height = `calc(100% - ${filtersHeight}px)`;
        sigmaInstance.refresh();
    }

    window.applyFilters = function () {
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
        });

        console.log('Filters:', filters); // Debugging log

        fetchGraphData({type: 'initial', filters});
        updateGraph();
        sigmaInstance.refresh();
    };


    window.clearFilters = function () {
        filters = [];
        const filterGroups = document.querySelectorAll('.filter-group');
        filterGroups.forEach(group => {
            group.remove();
        });
        filterCount = 0;
        fetchGraphData();
    };

    const container = document.getElementById('sigma-container');
    const graph = new Graph({multi: true});
    const sigmaInstance = new Sigma(graph, container, {allowInvalidContainer: true})


    fetchGraphData()

    function fetchGraphData(params = {}) {
        const query = new URLSearchParams(params).toString();
        const url = '/api/graph-data/' + (query ? '?' + query : '');

        fetch(url)
            .then(response => response.json())
            .then(data => {
                if (params.type) {
                    updateGraph(data.nodes, data.edges);
                } else {
                    initializeGraph(data.nodes, data.edges);
                }
            })
            .catch(error => console.error('Error loading graph data:', error));
    }

    function initializeGraph(nodes, edges) {
        graph.clear();
        nodes.forEach(node => {
            if (!graph.hasNode(node.id)) {
                graph.addNode(node.id, {
                    label: node.label,
                    node_type: node.node_type,
                    x: Math.random() * 100,
                    y: Math.random() * 100,
                    size: 10,
                    hidden: false, // Initially set to false
                    color: getNodeColor(node)
                });
            }
        });

        edges.forEach(edge => {
            if (!graph.hasEdge(edge.id)) {
                graph.addEdge(edge.source, edge.target);
                graph.setEdgeAttribute(edge.source, edge.target, 'hidden', false);
                console.log('Edge:', edge); // Debugging log
            }
        });

        applyLayout();
    }

    function updateGraph(nodes, edges) {
        nodes.forEach(node => {
            if (!graph.hasNode(node.id)) {
                graph.addNode(node.id, {
                    label: node.label,
                    node_type: node.node_type,
                    x: Math.random() * 100,
                    y: Math.random() * 100,
                    size: 8,
                    color: getNodeColor(node)
                });
            }
        });

        edges.forEach(edge => {
            if (!graph.hasEdge(edge.id)) {
                graph.addEdge(edge.source, edge.target, {'color': 'darkgrey'});
            }
        });

        applyLayout();
    }

    function getNodeColor(node) {
        if (node.hidden) {
            return rgbaToFloat(0, 0, 0, 0);
        }
        switch (node.node_type) {
            case 'category':
                return '#FF5733';
            case 'disease':
                return '#33C1FF';
            case 'allele':
                return '#FFFF33';
            default:
                return '#000000';
        }
    }

    function applyLayout() {
        const settings = {iterations: 100, settings: {gravity: 0.5, scalingRatio: 2.0}};
        forceAtlas2.assign(graph, settings);
        sigmaInstance.refresh();
    }

    sigmaInstance.on('clickNode', ({node}) => {
            const nodeData = graph.getNodeAttributes(node);
            if (nodeData.node_type === 'category') {
                fetchGraphData({type: 'diseases', category_id: node, filters: filters});
            } else if (nodeData.node_type === 'disease') {
                fetchGraphData({type: 'alleles', disease_id: encodeURIComponent(node), filters: filters});
            } else if (nodeData.node_type === 'allele') {
                const infoContainer = document.getElementsByClassName('info-container')[0];
                // Clear the container
                infoContainer.innerHTML = '';
                const title = document.createElement('h3');
                // Gets title from nodeData
                title.textContent = nodeData.label + ' Information';
                infoContainer.appendChild(title);
                // Fetch data from the API for the allele
                const allele = nodeData.label;
                const encodedAllele = encodeURIComponent(allele);
                const url = `/api/get-info/?allele=${encodedAllele}`;
                fetch(url)
                    .then(response => response.json())
                    .then(data => {
                            const table = document.createElement('table');
                            table.className = 'allele-info-table table table-striped table-bordered table-hover table-sm';
                            const headerRow = document.createElement('tr');
                            const header1 = document.createElement('th');
                            header1.textContent = 'Field';
                            headerRow.appendChild(header1);
                            const header2 = document.createElement('th');
                            header2.textContent = 'Value';
                            headerRow.appendChild(header2);
                            table.appendChild(headerRow);
                            Object.entries(data).forEach(([key, value]) => {
                                // Unpack the top_maf object and add each key-value pair as a row in the table
                                if (key === 'top_odds') {
                                    Object.entries(value).forEach(([index, top_odds]) => {
                                        console.log(top_odds); // Debugging log
                                        Object.entries(top_odds).forEach(([field, value]) => {
                                            console.log('Field:', field);
                                            console.log('Value:', value);
                                            const row = document.createElement('tr');
                                            const cell1 = document.createElement('td');
                                            cell1.textContent = field;
                                            row.appendChild(cell1);
                                            const cell2 = document.createElement('td');
                                            cell2.textContent = value.toString();
                                            row.appendChild(cell2);
                                            table.appendChild(row);
                                        });
                                    });
                                    return;
                                }
                                const row = document.createElement('tr');
                                const cell1 = document.createElement('td');
                                cell1.textContent = key;
                                row.appendChild(cell1);
                                const cell2 = document.createElement('td');
                                cell2.textContent = value;
                                row.appendChild(cell2);
                                table.appendChild(row);
                            });
                            infoContainer.appendChild(table);
                        }
                    )
                    .catch(error => console.error('Error loading allele info:', error));
            }
        }
    );

    // Add event listener for when a node hover event is triggered
    sigmaInstance.on('enterNode', ({node}) => {
        const nodeId = node;
        const edges = graph.edges().filter(edge => {
            return graph.source(edge) === nodeId || graph.target(edge) === nodeId;
        });

        console.log('Edges:', edges); // Debugging log

        edges.forEach(edge => {
            graph.setEdgeAttribute(edge, 'color', 'black');
        });

        sigmaInstance.refresh();
    });

// Add event listener for when a node hover ends
    sigmaInstance.on('leaveNode', ({node}) => {
        const nodeId = node;
        const edges = graph.edges().filter(edge => {
            return graph.source(edge) === nodeId || graph.target(edge) === nodeId;
        });

        edges.forEach(edge => {
            graph.setEdgeAttribute(edge, 'color', 'darkgrey'); // Reset to default color
        });

        sigmaInstance.refresh();
    });


});
