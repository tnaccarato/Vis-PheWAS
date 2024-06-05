var width = 960, height = 500;
var svg = d3.select("body").append("svg")
    .attr("width", width)
    .attr("height", height)
    .append("g")
    .attr("transform", "translate(40,0)");

var treeLayout = d3.tree().size([height - 100, width - 200]);

// Initial fetch for root categories
fetchData('category');

function fetchData(level, identifier = '') {
    var url = `/get_data/${level}/${identifier}`;
    d3.json(url).then(function(data) {
        var root = d3.hierarchy({name: "Root", children: data});
        update(root);
    }).catch(function(error) {
        console.error('Error loading or processing data:', error);
    });
}

function update(source) {
    treeLayout(source);

    // Create the links
    var links = svg.selectAll(".link")
        .data(source.links())
        .enter()
        .append("path")
        .attr("class", "link")
        .attr("d", d3.linkHorizontal()
            .x(function(d) { return d.y; })
            .y(function(d) { return d.x; }));

    // Create the node groups
    var nodes = svg.selectAll(".node")
        .data(source.descendants())
        .enter()
        .append("g")
        .attr("class", "node")
        .attr("transform", function(d) { return "translate(" + d.y + "," + d.x + ")"; });

    // Add circles for each node
    nodes.append("circle")
        .attr("r", 4)
        .on("click", function(d) {
            if (d.data.level) {
                fetchData(d.data.level, d.data.id);
            }
        });

    // Add labels for each node
    nodes.append("text")
        .attr("dy", "0.35em")
        .attr("x", function(d) { return d.children ? -8 : 8; })
        .style("text-anchor", function(d) { return d.children ? "end" : "start"; })
        .text(function(d) { return d.data.name; });

    svg.selectAll(".node").exit().remove();
    svg.selectAll(".link").exit().remove();
}
