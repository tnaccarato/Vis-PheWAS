import os
import urllib.parse
from datetime import datetime
from io import StringIO

import numpy as np
import pandas as pd
from django.conf import settings
from minisom import MiniSom

from mainapp.models import HlaPheWasCatalog

# Set the transparent colour for the visualisation
TRANSPARENT = 'rgba(0,0,0,0)'


def cluster_results_to_csv(cluster_results):
    """
    Function to save the cluster results to a CSV file.

    :param cluster_results: DataFrame with the cluster results
    :return: The name of the saved CSV
    """
    # Get the current timestamp
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    # Save the cluster results to a CSV file
    file_name = f"cluster_results_{timestamp}.csv"
    # Set the file path
    file_path = os.path.join(settings.MEDIA_ROOT, file_name)
    cluster_results.to_csv(file_path, index=False)
    # Return the file name
    return file_name


def preprocess_temp_data(temp_data):
    """
    Function to preprocess the temporary data in the database.

    :param temp_data: TemporaryCSVData object
    :return: Preprocessed DataFrame
    """
    # Read the CSV content
    csv_content = temp_data.csv_content
    df = pd.read_csv(StringIO(csv_content))
    # Preprocessing
    filtered_df = df[df['subtype'] != 0]  # Keep only 4-digit HLA alleles
    filtered_df = filtered_df[filtered_df['p'] < 0.05]  # Only keep statistically significant associations
    filtered_df['snp'] = filtered_df['snp'].str.replace('HLA_', '').str.strip()  # Remove the prefix "HLA_"
    return filtered_df


def initialise_som(x_normalised):
    """
    Function to initialise and train the SOM.

    :param x_normalised: Normalised feature matrix
    :return: Positions of the winning neurons and the trained SOM
    """
    # Use rule of 5 sqrt(n) for the number of neurons
    som_x = int(np.sqrt(5 * np.sqrt(x_normalised.shape[0])))
    som_y = int(np.sqrt(5 * np.sqrt(x_normalised.shape[0])))
    # Initialise the SOM
    input_len = x_normalised.shape[1]
    # Train the SOM with 10000 iterations
    som = MiniSom(x=som_x, y=som_y, input_len=input_len, sigma=1.0, learning_rate=0.5)
    som.random_weights_init(x_normalised)
    som.train_random(x_normalised, 10000)
    # Get the positions of the winning neurons
    positions = np.array([som.winner(x) for x in x_normalised])
    # Return the positions and the trained SOM
    return positions, som


def clean_filters(filters, som_type):
    """
    Function to clean and format the filters string.

    :param filters: Filters string
    :param som_type: Type of the SOM (SNP or disease)
    :return: Cleaned and formatted filters string
    """
    # If no filters are provided, return "All Genes" or "All Categories" as appropriate
    if not filters:
        return "All Genes" if som_type == 'snp' else "All Categories"

    # Decode (unescape) the filters string and split it into a list by " OR "
    decoded_filters = urllib.parse.unquote(filters)
    filters_list = decoded_filters.split(" OR ")
    cleaned_filters = [f.split(":==:")[-1] for f in filters_list]

    # Format filters into lines of 3 filters each with a line break between each line
    formatted_lines = [", ".join(cleaned_filters[i:i + 3]) for i in range(0, len(cleaned_filters), 3)]
    break_formatted_filters = "<br>".join(formatted_lines)

    # Return the formatted filters string in uppercase for SNPs and title case for diseases
    return break_formatted_filters.upper() if som_type == 'snp' else break_formatted_filters.title()


def prepare_categories_for_context(som_type):
    """
    Function to prepare the categories for the context.
    :param som_type: Type of the SOM (SNP or disease)
    :return: Categories based on the SOM type
    """
    # Get the categories based on the SOM type
    if som_type == 'snp':
        categories = HlaPheWasCatalog.objects.values('gene_name').distinct()
        categories = sorted([category['gene_name'] for category in categories], key=lambda s: s.lower())
    elif som_type == 'disease':
        categories = HlaPheWasCatalog.objects.values('category_string').distinct()
        categories = sorted([category['category_string'] for category in categories])
    # If no type is provided, set categories to None
    else:
        raise ValueError("Invalid SOM type. Please provide a valid type ('snp' or 'disease').")

    return categories


def create_title(filters, num_clusters, vis_type):
    """
    Function to create the title for the visualisation and return the cleaned filters.

    :param filters: Filters string
    :param num_clusters: Number of clusters
    :param vis_type: Type of the visualisation (disease or SNP)
    """
    # Clean and format the filters string
    cleaned_filters = clean_filters(filters, vis_type)
    # Create the title text
    title_text = (
        f'SOM Clusters of {"Diseases" if vis_type == "disease" else "SNPs"} with Detailed Hover Information<br>'
        f'for {cleaned_filters} and {num_clusters} Clusters'
    )
    # Return the cleaned filters and title text
    return cleaned_filters, title_text


def style_visualisation(cleaned_filters, fig, title_text) -> None:
    """
    Function to style the visualisation.

    :param cleaned_filters: Cleaned and formatted filters string
    :param fig: Plotly figure object
    :param title_text: Title text for the visualisation
    :return: None
    """
    # Style the visualisation layout
    fig.update_layout(
        title=dict(
            text=title_text,
            x=0.5,
            y=.93,
            xanchor='center',
            yanchor='top',
            font=dict(
                size=16,
                family='Arial, sans-serif',
                color='black'
            )
        ),
        margin=dict(
            t=100 + 20 * (len(cleaned_filters.split("<br>")) - 1),
        ),
        xaxis=dict(title='SOM X', showgrid=False, zeroline=False),
        yaxis=dict(title='SOM Y', showgrid=False, zeroline=False),
        plot_bgcolor=TRANSPARENT,  # Transparent background
        height=800,
        width=800,
        legend=dict(
            x=1.06,
            y=0.7,
            bgcolor=TRANSPARENT  # Transparent background
        ),
        paper_bgcolor=TRANSPARENT  # Transparent background
    )
    fig.data[0].colorbar.update(
        thickness=15,
        x=1.005,
        len=0.8
    )
