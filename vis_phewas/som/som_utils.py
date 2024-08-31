import datetime
import glob
import os
import urllib.parse
from datetime import datetime, timedelta
from io import StringIO

import numpy as np
import pandas as pd
from django.conf import settings
from mainapp.models import HlaPheWasCatalog
from matplotlib import pyplot as plt
from minisom import MiniSom
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score, davies_bouldin_score, calinski_harabasz_score
from sklearn.preprocessing import MinMaxScaler

# Set the transparent colour for the visualisation
TRANSPARENT = 'rgba(0,0,0,0)'


def cluster_results_to_csv(cluster_results):
    """
    Function to save the cluster results to a CSV file and delete old files.

    :param cluster_results: DataFrame with the cluster results
    :return: The name of the saved CSV
    """
    # Clean up old files
    clean_up_old_files()

    # Get the current timestamp
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    # Save the cluster results to a CSV file
    file_name = f"cluster_results_{timestamp}.csv"
    # Set the file path
    file_path = os.path.join(settings.MEDIA_ROOT, file_name)
    cluster_results.to_csv(file_path, index=False)
    # Return the file name
    return file_name


def clean_up_old_files() -> None:
    """
    Function to delete any cluster results files older than 1 day, but only if the oldest file is past the time delta.
    """
    # Define the directory and file pattern for cluster results files
    file_pattern = os.path.join(settings.MEDIA_ROOT, "cluster_results_*.csv")
    # Get all matching files
    files = glob.glob(file_pattern)

    if not files:
        return  # No files to clean up

    # Sort files by timestamp (oldest first)
    files.sort(key=lambda x: get_file_timestamp(x))

    # Get the timestamp of the oldest file
    oldest_file_time = get_file_timestamp(files[0])

    # Calculate the cutoff time for deletion (1 day ago)
    cutoff_time = datetime.now() - timedelta(days=1)

    # If the oldest file is older than the cutoff time, proceed with cleanup
    if oldest_file_time < cutoff_time:
        for file_path in files:
            file_time = get_file_timestamp(file_path)
            if file_time < cutoff_time:
                os.remove(file_path)
                print(f"Deleted old file: {os.path.basename(file_path)}")


def get_file_timestamp(file_path):
    """
    Extracts and parses the timestamp from the given file path.

    :param file_path: Path to the file
    :return: datetime object representing the file's timestamp
    """
    file_name = os.path.basename(file_path)
    try:
        # Extract and parse the timestamp from the filename
        parts = file_name.split('_')
        if len(parts) >= 4:  # Ensure there are enough parts to extract a valid timestamp
            timestamp_str = parts[2] + "_" + parts[3].split('.')[0]
            return datetime.strptime(timestamp_str, "%Y%m%d_%H%M%S")
    except ValueError:
        # In case of any parsing error, return a very recent time to avoid accidental deletion
        pass

    # Return a recent time if filename format is invalid
    return datetime.now()


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


def initialise_som(x_normalised, som_x=None, som_y=None, sigma=1.0, learning_rate=0.5, num_iterations=20000):
    """
    Function to initialise and train the SOM with dynamic parameters.

    :param x_normalised: Normalised feature matrix
    :param som_x: Width of the SOM grid
    :param som_y: Height of the SOM grid
    :param sigma: Spread of the neighborhood function
    :param learning_rate: Initial learning rate
    :param num_iterations: Number of iterations for training
    :return: Positions of the winning neurons and the trained SOM
    """
    # Use rule of 10 sqrt(n) for the number of neurons if not specified
    if som_x is None:
        som_x = int(np.sqrt(10 * np.sqrt(x_normalised.shape[0])))
    if som_y is None:
        som_y = int(np.sqrt(10 * np.sqrt(x_normalised.shape[0])))

    print(f"Training SOM with {som_x}x{som_y} grid, sigma={sigma}, learning_rate={learning_rate}, "
          f"num_iterations={num_iterations}")

    # Initialise the SOM
    input_len = x_normalised.shape[1]
    som = MiniSom(x=som_x, y=som_y, input_len=input_len, sigma=sigma, learning_rate=learning_rate)
    som.random_weights_init(x_normalised)
    som.train_random(x_normalised, num_iterations)

    # Get the positions of the winning neurons
    positions = np.array([som.winner(x) for x in x_normalised])
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

    # If all filters are selected, return "All Genes" or "All Categories" as appropriate
    if (som_type == 'snp' and len(cleaned_filters) == HlaPheWasCatalog.objects.values('gene_name')
            .distinct().count()):
        return "All Genes"
    if (som_type == 'disease' and len(cleaned_filters) == HlaPheWasCatalog.objects.values('category_string')
            .distinct().count()):
        return "All Categories"

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
            y=.95,
            xanchor='center',
            yanchor='top',
            font=dict(
                size=16,
                family='Arial, sans-serif',
                color='black'
            )
        ),
        margin=dict(
            t=150 + 20 * (len(cleaned_filters.split("<br>")) - 1),
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


def plot_metrics_on_som(positions, som_type):
    """
    Function to plot the Elbow Method and Silhouette Score graphs for a range of clusters based on the SOM grid positions.
    :param positions: 2D array of SOM positions (e.g., [[x1, y1], [x2, y2], ...])
    :param som_type: Type of the SOM (SNP or disease)
    :return: None
    """
    wcss = []
    silhouette_scores = []
    range_n_clusters = range(2, 11)  # Trying 2 to 10 clusters

    # Perform KMeans clustering for each number of clusters
    for n_clusters in range_n_clusters:
        kmeans = KMeans(n_clusters=n_clusters, random_state=42)
        cluster_labels = kmeans.fit_predict(positions)  # Use the SOM positions for clustering

        wcss.append(kmeans.inertia_)
        silhouette_avg = silhouette_score(positions, cluster_labels, random_state=42)
        silhouette_scores.append(silhouette_avg)

    # Plotting the Elbow Method graph (WCSS)
    plt.figure(figsize=(10, 5))
    plt.plot(range_n_clusters, wcss, marker='o')
    plt.title(f'Elbow Method For Optimal Number of Clusters for {som_type.capitalize()} Clustering')
    plt.xlabel('Number of Clusters')
    plt.ylabel('WCSS (Within-Cluster Sum of Squares)')
    plt.show()

    # Plotting the Silhouette Score graph
    plt.figure(figsize=(10, 5))
    plt.plot(range_n_clusters, silhouette_scores, marker='o')
    plt.title(f'Silhouette Score For Optimal Number of Clusters for {som_type.capitalize()} Clustering')
    plt.xlabel('Number of Clusters')
    plt.ylabel('Silhouette Score')
    plt.show()


def grid_search_som(x_normalised, output_csv='som_grid_search_results.csv', n_range=6):
    """
    Function to perform grid search for the best SOM parameters and save all results to a CSV file.

    :param n_range: Number of values to generate within the range for x and y dimensions
    :param x_normalised: Normalised feature matrix
    :param output_csv: The output CSV file path to save the grid search results
    :return: Best parameters and the corresponding quantisation error
    """
    # Define parameter ranges for the grid search
    lower_bound = int(np.sqrt(5 * np.sqrt(x_normalised.shape[0])))
    upper_bound = int(np.sqrt(10 * np.sqrt(x_normalised.shape[0])))

    # Generate n_range values between lower_bound and upper_bound using linspace
    som_grid_range = np.linspace(lower_bound, upper_bound, n_range, dtype=int)

    sigma_range = [0.5, 1.0, 1.5]
    learning_rate_range = [0.1, 0.5, 0.9]
    num_iterations_range = [5000, 10000, 20000]

    # Create a list to store all results
    results = []

    # Set a label column for n times
    grid_multiplier = 5
    # Perform grid search
    for som_size in som_grid_range:
        for sigma in sigma_range:
            for learning_rate in learning_rate_range:
                for num_iterations in num_iterations_range:
                    # Train the SOM with the current set of parameters
                    _, som = initialise_som(
                        x_normalised,
                        som_x=som_size,
                        som_y=som_size,
                        sigma=sigma,
                        learning_rate=learning_rate,
                        num_iterations=num_iterations
                    )

                    # Calculate quantisation error
                    qe = som.quantization_error(x_normalised)
                    te = som.topographic_error(x_normalised)

                    # Append the result to the results list
                    results.append({
                        'som_x': som_size,
                        'som_y': som_size,
                        'multiplier': grid_multiplier,
                        'sigma': sigma,
                        'learning_rate': learning_rate,
                        'num_iterations': num_iterations,
                        'quantisation_error': qe,
                        'topographic_error': te,
                    })
        grid_multiplier += 1  # Increment the grid multiplier for labelling

    # Convert results to a DataFrame
    results_df = pd.DataFrame(results)
    # Compute the combined score for each set of parameters
    results_df['combined_score'] = compute_combined_score(results_df['quantisation_error'],
                                                          results_df['topographic_error'])

    # Save the results DataFrame to a CSV file
    results_df.to_csv(output_csv, index=False)
    print(f"Grid search results saved to {output_csv}")


def compute_combined_score(qe, te):
    """
    Compute the combined score for quantisation error (QE) and topographic error (TE) after normalisation.

    :param qe: Quantisation error
    :param te: Topographic error
    :return: Combined score
    """
    # Initialize MinMaxScaler
    scaler = MinMaxScaler()

    # Normalise QE and TE separately
    normalised_qe = scaler.fit_transform(np.array(qe).reshape(-1, 1)).flatten()
    normalised_te = scaler.fit_transform(np.array(te).reshape(-1, 1)).flatten()

    # Compute the combined score by summing the normalised QE and TE
    combined_score = normalised_qe + normalised_te

    return combined_score


def evaluate_som(positions, positions_df, som, x_normalised, som_type):
    """
    Helper function to evaluate the SOM using various metrics and save the results to a CSV file.
    :param positions: The SOM positions
    :param positions_df: The positions DataFrame
    :param som: The trained SOM object
    :param x_normalised: The normalised input data
    :param som_type: Type of the SOM ('snp' or 'disease')
    :return:
    """
    # Evaluate the SOM using various metrics
    qe = som.quantization_error(x_normalised)
    te = som.topographic_error(x_normalised)
    silhouette = silhouette_score(positions, positions_df['cluster'], random_state=42)
    dbi = davies_bouldin_score(positions, positions_df['cluster'])
    ch = calinski_harabasz_score(positions, positions_df['cluster'])

    # Save the results to a CSV file
    results = {
        'Quantization Error': qe,
        'Topographic Error': te,
        'Silhouette Score': silhouette,
        'Davies-Bouldin Index': dbi,
        'Calinski-Harabasz Index': ch
    }
    results_df = pd.DataFrame(results, index=[0])

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    results_df.to_csv(f'som_evaluation_results_{som_type}_{timestamp}.csv', index=False)


def compute_mean_som_results(som_types=None):
    """
    Compute the mean of all the SOM evaluation results for each SOM type and save to a new CSV file.

    :param som_types: List of SOM types (e.g., ['snp', 'disease'])
    :return: Dictionary of DataFrames with mean results for each SOM type
    """
    # If no SOM types are provided, use the default list
    if som_types is None:
        som_types = ['snp', 'disease']
    mean_results = {}

    for som_type in som_types:
        # Find all CSV files matching the pattern for the given som_type
        file_pattern = f'som_evaluation_results_{som_type}_*.csv'
        files = glob.glob(file_pattern)

        # List to store dataframes for each file
        dataframes = []

        # Read each CSV file and add it to the list
        for file in files:
            df = pd.read_csv(file)
            dataframes.append(df)

        # If there are files to process, compute the mean
        if dataframes:
            # Concatenate all DataFrames into one
            all_data = pd.concat(dataframes, ignore_index=True)

            # Compute the mean for each column
            mean_df = all_data.mean().to_frame().T

            # Add the result to the dictionary
            mean_results[som_type] = mean_df

            # Save the mean results to a new CSV file
            mean_df.to_csv(f'som_evaluation_results_{som_type}_mean.csv', index=False)
        else:
            print(f"No files found for SOM type '{som_type}'")

    return mean_results


def create_hover_text(cluster_data, som_type):
    """
    Function to create the hover text for the SOM clusters based on the SOM type.
    :param cluster_data: DataFrame with the cluster data
    :param som_type: Type of the SOM ('snp' or 'disease')
    :return: List of hover texts for each node
    """
    hover_texts = []
    # Create the hover text based on the SOM type
    if som_type == 'snp':
        for _, row in cluster_data.iterrows():
            phenotype_details = "<br>".join([
                f"Phenotype: {phewas_string[:10]}..., Odds Ratio: {or_value:.2f}, P-Value: {p:.4f}"
                for phewas_string, or_value, p in zip(row['phenotypes'], row['odds_ratios'], row['p_values'])
            ])
            # Show only top 5 phenotypes based on odds ratio
            reduced_details = "<br>".join(phenotype_details.split("<br>")[:5])

            hover_text = f"SNP: {row['snp']}<br>{reduced_details}"
            hover_texts.append(hover_text)
    else:
        for _, row in cluster_data.iterrows():
            snp_details = "<br>".join([
                f"SNP: {snp}, Odds Ratio: {or_value:.2f}, P-Value: {p:.4f}"
                for snp, or_value, p in zip(row['snps'], row['odds_ratios'], row['p_values'])
            ])
            hover_text = f"Disease: {row['phewas_string']}<br>{snp_details}"
            hover_texts.append(hover_text)
    return hover_texts
