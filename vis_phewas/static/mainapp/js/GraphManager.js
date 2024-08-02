import Graph from "graphology";
import { Sigma } from "sigma";
import { createNodeBorderProgram } from "@sigma/node-border";
import GraphHelper from "./GraphHelper";
import { fetchAndShowAssociations } from "./associationsPlot";
import UIManager from "./UIManager";

class GraphManager {
  constructor(containerId, adjustSigmaContainerHeight) {
    this.container = document.getElementById(containerId);
    this.graph = new Graph({ multi: true });
    this.sigmaInstance = new Sigma(this.graph, this.container, {
      allowInvalidContainer: true,
      labelRenderedSizeThreshold: 35,
      defaultNodeType: "bordered",
      nodeProgramClasses: {
        bordered: createNodeBorderProgram({
          borders: [
            {
              size: { attribute: "borderSize", defaultValue: 0.5 },
              color: { attribute: "borderColor" },
            },
            { size: { fill: true }, color: { attribute: "color" } },
          ],
        }),
      },
    });
    this.adjustSigmaContainerHeight = adjustSigmaContainerHeight;
    this.graphHelper = new GraphHelper(
      this.sigmaInstance,
      this.adjustSigmaContainerHeight,
    );
    this.initEventListeners();
  }

  initEventListeners() {
    this.sigmaInstance.on("clickNode", ({ node }) => {
      this.graphHelper.clickedNode(
        this.graph,
        node,
        this.fetchGraphData.bind(this),
        this.adjustSigmaContainerHeight,
        this.getInfoTable.bind(this),
      );
    });

    this.sigmaInstance.on("enterNode", ({ node }) => {
      this.graphHelper.hoverOnNode(node, this.graph, this.sigmaInstance);
    });

    this.sigmaInstance.on("leaveNode", ({ node }) => {
      this.graphHelper.hoverOffNode(node, this.graph, this.sigmaInstance);
    });

    this.sigmaInstance.on("rightClickNode", ({ node }) => {
      const nodeAttributes = this.graph.getNodeAttributes(node);
      const forceLabel = nodeAttributes.forceLabel;
      this.graph.setNodeAttribute(node, "forceLabel", !forceLabel);
      this.graph.setNodeAttribute(node, "userForceLabel", !forceLabel);
      console.log("Force label:", !forceLabel); // Debugging log
      console.log("User force label:", !forceLabel); // Debugging
      this.sigmaInstance.refresh();
    });

    this.container.addEventListener("contextmenu", (event) => {
      event.preventDefault();
    });
  }

  fetchGraphData(params = {}) {
    params.show_subtypes = window.showSubtypes;

    const query = new URLSearchParams(params).toString();
    const url = "/api/graph-data/" + (query ? "?" + query : "");

    fetch(url)
      .then((response) => response.json())
      .then((data) => {
        if (params.type) {
          this.updateGraph(
            data.nodes,
            data.edges,
            data.visible,
            params.clicked,
          );
        } else {
          this.initializeGraph(data.nodes, data.edges, data.visible);
        }
      })
      .catch((error) => console.error("Error loading graph data:", error));
  }

  initializeGraph(nodes, edges, visible) {
    const centerX = this.container.offsetWidth / 2;
    const centerY = this.container.offsetHeight / 2;
    const radius = Math.min(centerX, centerY) - 100; // Adjusting radius to ensure nodes don't touch the edges

    this.graph.clear();

    nodes.forEach((node, nodeNumber) => {
      if ((!node) in visible) {
        return;
      }
      if (!this.graph.hasNode(node.id)) {
        const angle = (2 * Math.PI * nodeNumber) / nodes.length - Math.PI / 2;
        const x = centerX + radius * Math.cos(angle);
        const y = centerY - radius * Math.sin(angle);

        const color = this.graphHelper.calculateNodeColor(node);

        this.graph.addNode(node.id, {
          label: node.label.replace("HLA_", ""),
          full_label: node.label,
          node_type: node.node_type,
          forceLabel: true,
          x: x,
          y: y,
          size: 8,
          borderColor: color,
          borderSize: 0,
          hidden: false,
          color: color,
          userForceLabel: false,
        });
      }
    });

    edges.forEach((edge) => {
      if (!this.graph.hasEdge(edge.id)) {
        this.graph.addEdge(edge.source, edge.target);
        this.graph.setEdgeAttribute(edge.source, edge.target, "hidden", false);
      }
    });
  }

  updateGraph(nodes, edges, visible, clicked) {
    const graphNodes = this.graph.nodes();
    const graphEdges = this.graph.edges();

    if (!clicked) {
      graphNodes.forEach((node) => {
        this.graph.setNodeAttribute(node, "hidden", true);
      });
      graphEdges.forEach((edge) => {
        this.graph.setEdgeAttribute(edge, "hidden", true);
      });

      this.sigmaInstance.refresh();
    }

    nodes.forEach((node) => {
      if (!this.graph.hasNode(node.id)) {
        let { color, baseSize, borderSize, borderColor } =
          this.graphHelper.calculateBorder(node);
        this.graph.addNode(node.id, {
          label: node.label.replace("HLA_", ""),
          full_label: node.label,
          node_type: node.node_type,
          x: Math.random() * 100,
          y: Math.random() * 100,
          size: baseSize,
          odds_ratio: node.node_type === "allele" ? node.odds_ratio : null,
          allele_count: node.node_type === "disease" ? node.allele_count : null,
          borderColor: node.node_type === "allele" ? borderColor : color,
          borderSize: borderSize,
          color: color,
          expanded: false,
          forceLabel: node.node_type === "allele",
          userForceLabel: false,
        });
      }
      this.graph.setNodeAttribute(node.id, "hidden", visible.includes(node.id));
    });

    edges.forEach((edge) => {
      if (!this.graph.hasEdge(edge.id)) {
        this.graph.addEdge(edge.source, edge.target, { color: "darkgrey" });
      }
    });

    this.applyLayout();
  }

  applyLayout() {
    this.graphHelper.applyLayout(this.graph, this.sigmaInstance);
  }

  getInfoTable(nodeData) {
    const infoContainer = document.getElementsByClassName("info-container")[0];
    console.log("infoContainer:", infoContainer); // Debugging log
    const selectedNode = `${nodeData.node_type}-${nodeData.full_label}`;

    const edges = this.graph.edges().filter((edge) => {
      const source = this.graph.source(edge);
      const target = this.graph.target(edge);
      return source === selectedNode || target === selectedNode;
    });

    console.log("edges:", edges); // Debugging log

    const diseaseNodes = edges.map((edge) => {
      return this.graph.source(edge) === selectedNode
        ? this.graph.target(edge)
        : this.graph.source(edge);
    });

    console.log("diseaseNodes:", diseaseNodes); // Debugging log

    if (diseaseNodes.length === 0) {
      console.error("No disease nodes found.");
      return;
    }

    let currentIndex = 0;

    infoContainer.innerHTML = "";

    const closeButton = document.createElement("button");
    closeButton.className = "btn btn-danger";
    closeButton.textContent = "X";
    closeButton.onclick = this.closeInfoContainer(
      this.adjustSigmaContainerHeight,
    );
    infoContainer.appendChild(closeButton);

    const title = document.createElement("h3");
    title.textContent = nodeData.full_label + " Information";
    title.style.textAlign = "center";
    infoContainer.appendChild(title);

    const controlContainer = document.createElement("div");
    controlContainer.style.display = "flex";
    controlContainer.style.justifyContent = "center";
    const filterButton = document.createElement("button");
    filterButton.className = "btn btn-primary";
    filterButton.textContent = "Show All Diseases with Allele";
    filterButton.style.justifyContent = "center";
    filterButton.style.justifySelf = "center";
    filterButton.onclick = () => {
      if (window.filterManager) {
        window.filterManager.tableSelectFilter({
          field: "snp",
          value: nodeData.full_label,
        });
      } else {
        console.error("filterManager is not defined");
      }
    };
    controlContainer.appendChild(filterButton);
    infoContainer.appendChild(controlContainer);

    const navContainer = document.createElement("div");
    navContainer.style.display = "flex";
    navContainer.style.justifyContent = "space-between";
    navContainer.style.marginBottom = "10px";
    navContainer.style.alignItems = "center";

    if (diseaseNodes.length > 1) {
      const prevButton = document.createElement("button");
      prevButton.className = "btn btn-secondary";
      prevButton.textContent = "<";
      prevButton.onclick = () => {
        currentIndex =
          (currentIndex - 1 + diseaseNodes.length) % diseaseNodes.length;
        displayNodeInfo(diseaseNodes[currentIndex]);
      };
      navContainer.appendChild(prevButton);

      const navText = document.createElement("p");
      navText.style.textAlign = "center";
      navText.style.alignSelf = "center";
      navText.style.fontStyle = "italic";
      navText.style.fontWeight = "bold";
      navText.textContent = "<- Navigate between diseases ->";
      navText.style.margin = "0";

      navContainer.append(navText);

      const nextButton = document.createElement("button");
      nextButton.className = "btn btn-secondary";
      nextButton.textContent = ">";
      nextButton.onclick = () => {
        currentIndex = (currentIndex + 1) % diseaseNodes.length;
        displayNodeInfo(diseaseNodes[currentIndex]);
      };
      navContainer.appendChild(nextButton);
    }

    infoContainer.appendChild(navContainer);

    const displayOddsTables = (data) => {
      const { top_odds, lowest_odds } = data;

      const createOddsTable = (oddsData, heading) => {
        const oddsHead = document.createElement("h4");
        oddsHead.textContent = heading;
        oddsHead.style.textAlign = "center";
        infoContainer.appendChild(oddsHead);

        const table = document.createElement("table");
        table.className =
          "odds-table table table-striped table-bordered table-hover table-sm";

        const headerRow = document.createElement("tr");
        const header1 = document.createElement("th");
        header1.textContent = "Disease";
        headerRow.appendChild(header1);
        const header2 = document.createElement("th");
        header2.textContent = "Odds Ratio";
        headerRow.appendChild(header2);
        const header3 = document.createElement("th");
        header3.textContent = "P-Value";
        headerRow.appendChild(header3);
        table.appendChild(headerRow);

        oddsData.forEach((odds) => {
          const row = document.createElement("tr");
          const diseaseCell = document.createElement("td");
          diseaseCell.textContent = odds.phewas_string;
          row.appendChild(diseaseCell);
          const oddsCell = document.createElement("td");
          oddsCell.textContent = odds.odds_ratio.toString();
          row.appendChild(oddsCell);
          const pValueCell = document.createElement("td");
          pValueCell.textContent = odds.p.toString();
          row.appendChild(pValueCell);
          row.onclick = () => {
            if (window.filterManager) {
              window.filterManager.tableSelectFilter(
                {
                  field: "phewas_string",
                  value: odds.phewas_string,
                },
                this.fetchGraphData.bind(this),
                this.sigmaInstance,
                UIManager.showAlert,
              );
            } else {
              console.error("filterManager is not defined");
            }
          };
          table.appendChild(row);
        });

        infoContainer.appendChild(table);
      };

      createOddsTable(top_odds, "Most Affected Diseases");
      createOddsTable(lowest_odds, "Most Mitigated Diseases");
    };

    const displayNodeInfo = (diseaseNode) => {
      const existingDiseaseInfo = infoContainer.querySelector(".disease-info");

      const disease = this.graph.getNodeAttributes(diseaseNode).full_label;
      if (!disease) {
        console.error("Disease is null or undefined");
        return;
      }
      const encodedAllele = encodeURIComponent(nodeData.full_label);
      const encodedDisease = encodeURIComponent(disease);
      const url = `/api/get-info/?allele=${encodedAllele}&disease=${encodedDisease}`;

      const updateNodeStyle = (nodeData) => {
        const alleleNode = `allele-HLA_${nodeData.gene_name}_${nodeData.serotype.toString()}${
          window.showSubtypes === true ? "" + nodeData.subtype.toString() : ""
        }`;
        const node = this.graph.getNodeAttributes(alleleNode);

        node.node_type = "allele";
        node.odds_ratio = nodeData.odds_ratio;
        node.p = nodeData.p;

        let { color, baseSize, borderSize, borderColor } =
          this.graphHelper.calculateBorder(node);

        this.graph.setNodeAttribute(alleleNode, "color", color);
        this.graph.setNodeAttribute(alleleNode, "borderColor", borderColor);
        this.graph.setNodeAttribute(alleleNode, "borderSize", borderSize);
        this.graph.setNodeAttribute(alleleNode, "size", baseSize);

        this.graph.nodes().forEach((node) => {
          if (
            node !== diseaseNode &&
            this.graph.getNodeAttribute(node, "node_type") === "disease"
          ) {
            this.graph.setNodeAttribute(
              node,
              "borderColor",
              this.graph.getNodeAttribute(node, "color"),
            );
            this.graph.setNodeAttribute(node, "borderSize", 0);
            if (this.graph.getNodeAttribute(node, "userForceLabel") === false) {
              this.graph.setNodeAttribute(node, "forceLabel", false);
            }
          }

          if (
            this.graph.getNodeAttribute(node, "node_type") === "allele" &&
            node !== alleleNode
          ) {
            if (this.graph.getNodeAttribute(node, "userForceLabel") === false) {
              this.graph.setNodeAttribute(node, "forceLabel", false);
            } else {
              this.graph.setNodeAttribute(node, "forceLabel", true);
            }
          }
        });

        this.graph.setNodeAttribute(diseaseNode, "borderColor", "black");
        this.graph.setNodeAttribute(diseaseNode, "borderSize", 0.1);
        this.graph.setNodeAttribute(diseaseNode, "forceLabel", true);

        this.sigmaInstance.refresh();
      };

      fetch(url)
        .then((response) => {
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          return response.json();
        })
        .then((data) => {
          if (data.error) {
            throw new Error(data.error);
          }

          const table = document.createElement("table");
          table.className =
            "disease-info allele-info-table table table-striped table-bordered table-hover table-sm";
          const headerRow = document.createElement("tr");
          const header1 = document.createElement("th");
          header1.textContent = "Field";
          headerRow.appendChild(header1);
          const header2 = document.createElement("th");
          header2.textContent = "Value";
          headerRow.appendChild(header2);
          table.appendChild(headerRow);

          Object.entries(data).forEach(([key, value]) => {
            if (key !== "top_odds" && key !== "lowest_odds") {
              const row = document.createElement("tr");
              const cell1 = document.createElement("td");
              cell1.textContent = key;
              row.appendChild(cell1);
              const cell2 = document.createElement("td");
              cell2.textContent = value;
              row.appendChild(cell2);
              if (key === "phewas_string") {
                const cell3 = document.createElement("td");
                const button = document.createElement("button");
                button.className = "btn btn-primary";
                button.textContent = "Show Combinational Associations";
                button.onclick = () => {
                  fetchAndShowAssociations(value, window.showSubtypes);
                };
                cell3.appendChild(button);
                row.appendChild(cell3);
              }
              table.appendChild(row);
            }
          });

          infoContainer.style.overflowY = "auto";
          if (existingDiseaseInfo) {
            existingDiseaseInfo.replaceWith(table);
          } else {
            infoContainer.appendChild(table);
          }
          updateNodeStyle(data);
        })
        .catch((error) => {
          console.error("Error loading disease info:", error);
          const errorMessage = document.createElement("div");
          errorMessage.className = "disease-info alert alert-danger";
          errorMessage.textContent = `Error loading disease info: ${error.message}`;
          infoContainer.appendChild(errorMessage);
        });
    };

    displayNodeInfo(diseaseNodes[currentIndex]);

    const encodedAllele = encodeURIComponent(nodeData.full_label);
    const encodedDisease = encodeURIComponent(
      this.graph.getNodeAttributes(diseaseNodes[currentIndex]).full_label,
    );
    const url = `/api/get-info/?allele=${encodedAllele}&disease=${encodedDisease}`;

    fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        if (data.error) {
          throw new Error(data.error);
        }

        displayOddsTables(data);
      })
      .catch((error) => {
        console.error("Error loading allele info:", error);
        const errorMessage = document.createElement("div");
        errorMessage.className = "alert alert-danger";
        errorMessage.textContent = `Error loading allele info: ${error.message}`;
        infoContainer.appendChild(errorMessage);
      });
  }

  closeInfoContainer(adjustSigmaContainerHeight) {
    return () => {
      const leftColumn = document.getElementsByClassName(
        "col-md-6 left-column",
      )[0];
      leftColumn.style.width = "100%";
      // Resize the Sigma container
      adjustSigmaContainerHeight();
      const rightColumn = document.getElementsByClassName(
        "col-md-6 right-column",
      )[0];
      rightColumn.style.display = "none";
      const infoPanel = document.getElementsByClassName("info-container")[0];
      infoPanel.style.display = "none";
      // Add the force label to the allele nodes
      const nodes = this.graph.nodes();
      nodes.forEach((n) => {
        if (
          (this.graph.getNodeAttribute(n, "node_type") === "allele" &&
            !this.graph.getNodeAttribute(n, "userForceLabel")) ||
          (this.graph.getNodeAttribute(n, "node_type") === "disease" &&
            this.graph.getNodeAttribute(n, "expanded"))
        ) {
          this.graph.setNodeAttribute(n, "forceLabel", true);
        }
      });
    };
  }
}

export default GraphManager;
