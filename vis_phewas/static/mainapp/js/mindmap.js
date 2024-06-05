var width = 960, height = 500;
var svg = d3.select("body").append("svg")
    .attr("width", width)
    .attr("height", height)
    .append("g")
    .attr("transform", "translate(100,0)"); // Adjusted for better centering

var treeLayout = d3.tree().size([height - 100, width - 200]);

// Initial fetch for root categories
fetchData('category');

function fetchData(level, identifier = '') {
    var url = `/get_data/${level}/${identifier}`;
    d3.json(url).then(function(data) {
        var rootNode = {name: "Root", children: data}; // Invisible root node
        var root = d3.hierarchy(rootNode); // Create a hierarchy from the root
        update(root);
    }).catch(function(error) {
        console.error('Error loading or processing data:', error);
    });
}

function update(source) {
    treeLayout(source);

    // Create the links, excluding those from the invisible root
    var links = svg.selectAll(".link")
        .data(source.links().filter(link => link.source.depth > 0))
        .enter()
        .append("path")
        .attr("class", "link")
        .attr("d", d3.linkHorizontal()
            .x(d => d.y)
            .y(d => d.x));

    // Create the node groups, excluding the invisible root
    var nodes = svg.selectAll(".node")
        .data(source.descendants().slice(1)) // Slice to skip the invisible root node
        .enter()
        .append("g")
        .attr("class", "node")
        .attr("transform", d => `translate(${d.y},${d.x})`);

    // Add circles for each node
    nodes.append("circle")
        .attr("r", 4)
        .on("click", function(d) {
            // Trigger further data fetching based on node's level and id
            if (d.data.level && d.data.id) {
                fetchData(d.data.level, d.data.id);
            }
        });

    // Add labels for each node
    nodes.append("text")
        .attr("dy", "0.35em")
        .attr("x", d => d.children ? -8 : 8)
        .style("text-anchor", d => d.children ? "end" : "start")
        .text(d => d.data.name);

    // Remove old nodes and links
    svg.selectAll(".node").exit().remove();
    svg.selectAll(".link").exit().remove();
}
