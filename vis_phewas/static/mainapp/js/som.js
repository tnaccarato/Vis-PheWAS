function generateSOM(filters, type) {
  // Validate the type parameter
  if (type !== "allele" && type !== "disease") {
    alert("Invalid SOM type specified. Must be 'allele' or 'disease'.");
    return;
  }

  $.ajax({
    url: "/api/send_data_to_som/",
    type: "GET",
    data: {
      filters: filters, // Initialize with no filter but allow to pass filters
      type: type,
    },
    success: function (response) {
      // Determine the correct SOM visualization page based on the type
      let url = type === "allele" ? "/som/SOMSNP/" : "/som/SOMDisease/";

      // Open the SOM visualization page
      if (filters === "") {
        window.open(
          url + "?data_id=" + response.data_id,
          type === "allele" ? "AlleleSOMWindow" : "DiseaseSOMWindow",
          "width=800,height=600,scrollbars=yes,resizable=yes"
        );
      } else {
        window.open(url + "?data_id=" + response.data_id, "_self");
      }
    },
    error: function (xhr, status, error) {
      alert("Failed to generate SOM: " + error);
    },
  });
}

// Assign the function to window object for external use
window.generateSOM = generateSOM;
