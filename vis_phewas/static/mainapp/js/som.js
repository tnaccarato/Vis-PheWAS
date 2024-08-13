function generateSOM(filters, type, num_clusters) {
  // Validate the type parameter
  if (type !== "allele" && type !== "disease") {
    alert("Invalid SOM type specified. Must be 'allele' or 'disease'.");
    return;
  }
  if (num_clusters == null) {
    num_clusters = type === "disease" ? 5 : 7;
  }

  console.log("Generating SOM with filters: " + filters + ", type: " + type + ", num_clusters: " + num_clusters);

  $.ajax({
    url: "/api/send_data_to_som/",
    type: "GET",
    data: {
      filters: filters, // Initialize with no filter but allow to pass filters
      type: type,
      num_clusters: num_clusters
    },
    success: function (response) {
      // Determine the correct SOM visualization page based on the type
      let url = type === "allele" ? "/som/SOMSNP/" : "/som/SOMDisease/";

      // Open the SOM visualization page
      if (filters === "") {
        // If no filters, it means the SOM is generated for all data as an initial SOM
        window.open(
          url + "?data_id=" + response.data_id,
          type === "allele" ? "AlleleSOMWindow" : "DiseaseSOMWindow",
          "width=800,height=600,scrollbars=yes,resizable=yes"
        );
      } else {
        // If filters are specified, pass them as query parameters to the SOM page
        window.open(url + "?data_id=" + encodeURIComponent(response.data_id) +
            "&num_clusters=" + encodeURIComponent(response.num_clusters) +
            "&filters=" + encodeURIComponent(filters), "_self");

      }
    },
    error: function (xhr, status, error) {
      alert("Failed to generate SOM: " + error);
    },
  });
}

// Assign the function to window object for external use
window.generateSOM = generateSOM;
