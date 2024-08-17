import os
import urllib.parse
from collections import defaultdict
from datetime import datetime
from io import StringIO

import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import plotly.io as pio
from api.models import TemporaryCSVData
from django.conf import settings
from django.shortcuts import render, get_object_or_404
from mainapp.models import HlaPheWasCatalog
from minisom import MiniSom
from rest_framework.views import APIView
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler, OneHotEncoder


def cluster_results_to_csv(cluster_results):
    """
    Static method to save the cluster results to a CSV file.

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
    Static method to preprocess the temporary data in the database.

    :param temp_data: TemporaryCSVData object
    :return: Preprocessed DataFrame
    """
    # Read the CSV content
    csv_content = temp_data.csv_content
    df = pd.read_csv(StringIO(csv_content))
    # Preprocessing
    filtered_df = df[df['subtype'] != 0]  # Keep only 4-digit HLA alleles
    filtered_df = filtered_df[filtered_df['p'] < 0.05]  # Only keep statistically significant associations
    filtered_df['snp'] = filtered_df['snp'].str.replace('HLA_', '')  # Remove the prefix "HLA_"
    return filtered_df


def initialise_som(x_normalised):
    """
    Static method to initialise and train the SOM.

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
    Static method to clean and format the filters string.

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
    Static method to prepare the categories for the context.
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
    Static method to create the title for the visualisation and return the cleaned filters.

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
    Static method to style the visualisation.

    :param cleaned_filters: Cleaned and formatted filters string
    :param fig: Plotly figure object
    :param title_text: Title text for the visualisation
    :return: None
    """
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
        plot_bgcolor='rgba(0,0,0,0)',
        height=800,
        width=800,
        legend=dict(
            x=1.06,
            y=0.7,
            bgcolor='rgba(0,0,0,0)'
        ),
        paper_bgcolor='rgba(0,0,0,0)'
    )
    fig.data[0].colorbar.update(
        thickness=15,
        x=1.005,
        len=0.8
    )


def process_and_visualise_som(data_id, num_clusters, filters, som_type):
    """
    Shared method to process data and generate SOM visualisation.

    :param data_id: ID of the temporary data
    :param num_clusters: Number of clusters
    :param filters: Filters string
    :param som_type: Type of the SOM (SNP or disease)
    """
    # Retrieve the temporary CSV data object using the data_id
    temp_data = get_object_or_404(TemporaryCSVData, id=data_id)
    filtered_df = preprocess_temp_data(temp_data)

    # Group the data based on the SOM type
    if som_type == 'snp':
        # Group the data by SNP and aggregate the values
        grouped_df = filtered_df.groupby('snp').agg({
            'phewas_string': list,
            'p': list,
            'odds_ratio': list,
            'category_string': list,
            'l95': list,
            'u95': list,
            'maf': list,
        }).reset_index()

        # Feature engineering for SNPs
        all_phenotypes = set([phenotype for phenotypes in grouped_df['phewas_string'] for phenotype in phenotypes])
        exploded_df = grouped_df.explode('phewas_string').explode('category_string')

        # One-Hot Encode categorical variables with sparse one-hot encoding to save memory
        ohe_phenotype = OneHotEncoder(sparse_output=False)
        ohe_category = OneHotEncoder(sparse_output=False)
        # Encode the phenotype and category variables
        phenotype_encoded = ohe_phenotype.fit_transform(exploded_df[['phewas_string']])
        category_encoded = ohe_category.fit_transform(exploded_df[['category_string']])

        # Aggregate the encoded features
        phenotype_aggregated = pd.DataFrame(
            phenotype_encoded,
            columns=ohe_phenotype.categories_[0],
            index=exploded_df['snp']
        ).groupby('snp').sum()

        # Aggregate the encoded features
        category_aggregated = pd.DataFrame(
            category_encoded,
            columns=ohe_category.categories_[0],
            index=exploded_df['snp']
        ).groupby('snp').sum()

        # Combine the aggregated features
        encoded_features = np.hstack([phenotype_aggregated, category_aggregated])

        # Create the phenotype features for each row
        def create_phenotype_features(df_row):
            # Create a dictionary to store the features
            features = defaultdict(float)
            # Iterate over the phenotypes, p-values, and odds ratios
            for phenotype, p, or_value in zip(df_row['phewas_string'], df_row['p'], df_row['odds_ratio']):
                features[phenotype] = or_value * 5  # Scale the odds ratio by 5 for better visualisation
            # Create the phenotype features
            phenotype_features = [features[phenotype] for phenotype in all_phenotypes]
            # Return the combined features
            return np.hstack([phenotype_features, encoded_features[df_row.name]])

        # Apply the function to create the phenotype features
        features_matrix = grouped_df.apply(create_phenotype_features, axis=1)

    else:
        # Feature engineering for diseases
        grouped_df = filtered_df.groupby('phewas_string').agg({
            'snp': list,
            'gene_name': list,
            'p': list,
            'odds_ratio': list,
            'category_string': 'first',
            'l95': list,
            'u95': list,
            'maf': list,
        }).reset_index()

        # One-Hot Encode categorical variables with sparse one-hot encoding to save memory
        all_alleles = sorted(set(allele for alleles in grouped_df['snp'] for allele in alleles))
        ohe = OneHotEncoder(sparse_output=False)
        # Encode the gene name variable with one-hot encoding
        gene_name_encoded = ohe.fit_transform(
            grouped_df['gene_name'].apply(lambda x: ','.join(set(x))).str.get_dummies(sep=',')
        )
        # Encode the category variable
        category_encoded = ohe.fit_transform(grouped_df[['category_string']])
        # Combine the encoded features
        encoded_features = np.hstack([gene_name_encoded, category_encoded])

        # Create the allele features for each row
        def create_allele_features(df_row):
            # Create a dictionary to store the features
            features = defaultdict(float)
            # Iterate over the alleles, p-values, and odds ratios
            for allele, p, or_value in zip(df_row['snp'], df_row['p'], df_row['odds_ratio']):
                features[allele] = or_value * 5  # Scale the odds ratio by 5 for better visualisation
            # Create the allele features
            allele_features = [features[allele] for allele in all_alleles]
            # Return the combined features
            return np.hstack([allele_features, encoded_features[df_row.name]])

        # Apply the function to create the allele features
        features_matrix = grouped_df.apply(create_allele_features, axis=1)

    # Normalise the features matrix
    x = np.array(features_matrix.tolist())

    # Standardise and normalise the features
    scaler = StandardScaler()
    x_normalised = scaler.fit_transform(x)

    # Initialise and train the SOM with the normalised features to get the positions and the trained SOM
    positions, som = initialise_som(x_normalised)
    # Create a DataFrame with the positions
    positions_df = pd.DataFrame(positions, columns=['x', 'y'])

    # Create the results DataFrame based on the SOM type
    if som_type == 'snp':
        results_df = pd.DataFrame({
            'snp': grouped_df['snp'],
            'x': positions_df['x'],
            'y': positions_df['y'],
            'p_values': grouped_df['p'],
            'odds_ratios': grouped_df['odds_ratio'],
            'phenotypes': grouped_df['phewas_string']
        })
    else:
        results_df = pd.DataFrame({
            'phewas_string': grouped_df['phewas_string'],
            'x': positions_df['x'],
            'y': positions_df['y'],
            'p_values': grouped_df['p'],
            'odds_ratios': grouped_df['odds_ratio'],
            'snps': grouped_df['snp']
        })

    # K-Means clustering
    kmeans = KMeans(n_clusters=int(num_clusters), random_state=42)
    positions_df['cluster'] = kmeans.fit_predict(positions_df)
    results_df['cluster'] = positions_df['cluster']

    # Save cluster results to a CSV
    cluster_results = results_df.sort_values(by=['cluster', 'snp' if som_type == 'snp' else 'phewas_string'])
    file_name = cluster_results_to_csv(cluster_results)

    # Generate the SOM visualisation
    fig = go.Figure()
    distance_map = som.distance_map().T
    fig.add_trace(go.Heatmap(
        z=distance_map,
        colorscale='cividis',
        colorbar=dict(title='Distance'),
        showscale=True,
    ))

    # Add the cluster data to the visualisation
    for cluster in range(int(num_clusters)):
        cluster_data = results_df[results_df['cluster'] == cluster]
        hover_texts = []
        # Create the hover text based on the SOM type
        if som_type == 'snp':
            for _, row in cluster_data.iterrows():
                phenotype_details = "<br>".join([
                    f"Phenotype: {phewas_string[:10]}..., Odds Ratio: {or_value:.2f}, P-Value: {p:.4f}"
                    for phewas_string, or_value, p in zip(row['phenotypes'], row['odds_ratios'], row['p_values'])
                ])
                hover_text = f"SNP: {row['snp']}<br>{phenotype_details}"
                hover_texts.append(hover_text)
        else:
            for _, row in cluster_data.iterrows():
                snp_details = "<br>".join([
                    f"SNP: {snp}, Odds Ratio: {or_value:.2f}, P-Value: {p:.4f}"
                    for snp, or_value, p in zip(row['snps'], row['odds_ratios'], row['p_values'])
                ])
                hover_text = f"Disease: {row['phewas_string']}<br>{snp_details}"
                hover_texts.append(hover_text)

        # Add the cluster data to the visualisation
        fig.add_trace(go.Scatter(
            x=cluster_data['x'] + 0.5,
            y=cluster_data['y'] + 0.5,
            mode='markers',
            marker=dict(
                size=10,
                color=px.colors.qualitative.Dark24[cluster],
                opacity=0.8,
            ),
            text=hover_texts,
            hoverinfo='text'
        ))

    # Clean and format the filters string and create the title text
    cleaned_filters, title_text = create_title(filters, num_clusters, som_type)
    # Style the visualisation
    style_visualisation(cleaned_filters, fig, title_text)

    # Render the visualisation
    graph_div = pio.to_html(fig, full_html=False)
    # Prepare the categories for the context
    categories = prepare_categories_for_context(som_type)

    # Return the context for the visualisation
    return {
        'graph_div': graph_div,
        'csv_path': settings.MEDIA_URL + file_name,
        'type': 'allele' if som_type == 'snp' else 'disease',
        'categories': categories,
        'num_clusters': num_clusters,
        'filters': filters if filters else categories,
        'cleaned_filters': cleaned_filters
    }


class SOMSNPView(APIView):
    """
    View to generate and display the SOM visualisation for SNPs.
    """

    def get(self, request):
        """
        :param request: Request object with parameters data_id, num_clusters, and filters
        :return: Rendered template with the SOM visualisation for SNPs
        """
        # Get the parameters from the request
        data_id = request.GET.get('data_id')
        num_clusters = request.GET.get('num_clusters', 7)
        filters = request.GET.get('filters')
        # Process and visualise the SOM
        context = process_and_visualise_som(data_id, num_clusters, filters, 'snp')
        # Render the template with the context
        return render(request, 'som/som_view.html', context)


class SOMDiseaseView(APIView):
    """
    View to generate and display the SOM visualisation for diseases.

    """

    def get(self, request):
        """
        :param request: Request object with parameters data_id, num_clusters, and filters
        :return: Rendered template with the SOM visualisation for diseases
        """
        # Get the parameters from the request
        data_id = request.GET.get('data_id')
        num_clusters = request.GET.get('num_clusters', 5)
        filters = request.GET.get('filters')
        # Process and visualise the SOM
        context = process_and_visualise_som(data_id, num_clusters, filters, 'disease')
        # Render the template with the context
        return render(request, 'som/som_view.html', context)
