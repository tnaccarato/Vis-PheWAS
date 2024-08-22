/**
 * Function to generate a Self-Organizing Map (SOM) based on the provided filters, type, and number of clusters.
 * @param {string} filters - The filters to apply to the data.
 * @param {string} type - The type of SOM to generate ('allele' or 'disease').
 * @param {number} [num_clusters] - The number of clusters to generate. Defaults to 5 for 'disease' and 7 for 'allele'.
 */
function generateSOM(filters, type, num_clusters) {
  console.log("Generating SOM with filters: " + filters + ", type: " + type + ", num_clusters: " + num_clusters);
  // Validate the type parameter
  if (type !== "snp" && type !== "disease") {
    alert("Invalid SOM type specified. Must be 'snp' or 'disease'.");
    return;
  }

  // If num_clusters is not provided, set default values based on the type
  if (num_clusters == null) {
    num_clusters = type === "disease" ? 5 : 7;
  }

  console.log("Generating SOM with filters: " + filters + ", type: " + type + ", num_clusters: " + num_clusters);

  // Send the data to the server to generate the SOM
  $.ajax({
    url: "/api/send_data_to_som/",
    type: "GET",
    data: {
      filters: filters, // Initialize with no filter but allow to pass filters
      type: type,
      num_clusters: num_clusters
    },

    // Handle the response from the server
    success: function (response) {
      // Get the URL for the SOM visualisation page
      let url = "/som/SOM/";

      // Open the SOM visualization page
      if (filters === "") {
        // If no filters, it means the SOM is generated for all data as an initial SOM
        window.open(
          url + "?data_id=" + response.data_id + "&type=" + type,
          "SOMWindow",
          "width=800,height=600,scrollbars=yes,resizable=yes"
        );
      } else {
        // If filters are specified, pass them as query parameters to the SOM page
        window.open(url + "?data_id=" + encodeURIComponent(response.data_id) +
            "&num_clusters=" + encodeURIComponent(response.num_clusters) +
            "&filters=" + encodeURIComponent(filters)+ "&type=" + type
            , "_self")

      }
    },
    // Handle any errors that occur during the request
    error: function (xhr, status, error) {
      alert("Failed to generate SOM: " + error);
    },
  });
}

// Assign the function to window object for external use
window.generateSOM = generateSOM;