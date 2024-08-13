import os
from datetime import datetime

from django.conf import settings
from django.shortcuts import render, get_object_or_404
import pandas as pd
from collections import defaultdict
from api.models import TemporaryCSVData
from rest_framework.views import APIView
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from minisom import MiniSom
import numpy as np
from sklearn.cluster import KMeans
import plotly.express as px
import plotly.graph_objects as go
import plotly.io as pio
from io import StringIO

from mainapp.models import HlaPheWasCatalog


def cluster_results_to_csv(cluster_results):
    """
    Static method to save the cluster results to a CSV file.
    :param cluster_results:
    :return:
    """
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    file_name = f"cluster_results_{timestamp}.csv"
    file_path = os.path.join(settings.MEDIA_ROOT, file_name)
    cluster_results.to_csv(file_path, index=False)
    return file_name


class SOMSNPView(APIView):
    """
    View to process SNPs data using SOM and return a Plotly visualization.
    """

    def get(self, request):
        # Get the data_id from the request (passed as a query parameter)
        data_id = request.GET.get('data_id')
        num_clusters = request.GET.get('num_clusters')
        # Retrieve the temporary CSV data object using the data_id
        temp_data = get_object_or_404(TemporaryCSVData, id=data_id)

        if num_clusters is None:
            num_clusters = 7

        # Convert the CSV content to a DataFrame
        csv_content = temp_data.csv_content
        df = pd.read_csv(StringIO(csv_content))

        # Preprocessing
        filtered_df = df[df['subtype'] != 0]  # Keep only 4-digit HLA alleles
        filtered_df = filtered_df[filtered_df['p'] < 0.05]  # Only keep statistically significant associations
        filtered_df['snp'] = filtered_df['snp'].str.replace('HLA_', '')  # Remove the prefix "HLA_"

        # Group by SNP
        grouped_df = filtered_df.groupby('snp').agg({
            'phewas_string': list,
            'p': list,
            'odds_ratio': list,
            'category_string': list,
            'l95': list,
            'u95': list,
            'maf': list,
        }).reset_index()

        # Identify all unique phenotypes
        all_phenotypes = set([phenotype for phenotypes in grouped_df['phewas_string'] for phenotype in phenotypes])

        # Explode the 'phewas_string' and 'category_string' lists
        exploded_df = grouped_df.explode('phewas_string').explode('category_string')

        # One-Hot Encode the 'phewas_string' and 'category_string'
        ohe_phenotype = OneHotEncoder(sparse_output=False)
        ohe_category = OneHotEncoder(sparse_output=False)

        phenotype_encoded = ohe_phenotype.fit_transform(exploded_df[['phewas_string']])
        category_encoded = ohe_category.fit_transform(exploded_df[['category_string']])

        # Aggregate the one-hot encoded features back to the SNP level
        phenotype_aggregated = pd.DataFrame(
            phenotype_encoded,
            columns=ohe_phenotype.categories_[0],
            index=exploded_df['snp']
        ).groupby('snp').sum()

        category_aggregated = pd.DataFrame(
            category_encoded,
            columns=ohe_category.categories_[0],
            index=exploded_df['snp']
        ).groupby('snp').sum()

        # Combine the aggregated one-hot encoded features into a single feature matrix
        encoded_features = np.hstack([phenotype_aggregated, category_aggregated])

        # Feature matrix creation
        def create_phenotype_features(row, phenotypes, phenotype_weight=5):
            features = defaultdict(float)
            for phenotype, p, or_value in zip(row['phewas_string'], row['p'], row['odds_ratio']):
                features[phenotype] = or_value * phenotype_weight
            phenotype_features = [features[phenotype] for phenotype in phenotypes]
            return np.hstack([phenotype_features, encoded_features[row.name]])

        features_matrix = grouped_df.apply(create_phenotype_features, phenotypes=all_phenotypes, axis=1)
        x = np.array(features_matrix.tolist())
        scaler = StandardScaler()
        x_normalized = scaler.fit_transform(x)

        # Initialize and Train the SOM
        positions, som = initialise_som(x_normalized)
        

        # Get Winning Positions for Each SNP
        positions = np.array([som.winner(x) for x in x_normalized])

        # Create a DataFrame with Results
        results_df = pd.DataFrame({
            'snp': grouped_df['snp'],
            'x': positions[:, 0],
            'y': positions[:, 1],
            'p_values': grouped_df['p'],
            'odds_ratios': grouped_df['odds_ratio'],
            'phenotypes': grouped_df['phewas_string']
        })

        # Clustering SNPs Using K-Means
        n_clusters = int(num_clusters)
        kmeans = KMeans(n_clusters=n_clusters, random_state=42)
        positions_df = pd.DataFrame(positions, columns=['x', 'y'])
        positions_df['cluster'] = kmeans.fit_predict(positions_df)

        # Merge clustering results with the original results_df
        results_df['cluster'] = positions_df['cluster']

        # Save the cluster results to a CSV file
        cluster_results = results_df[['snp', 'cluster', 'phenotypes', 'p_values', 'odds_ratios']]
        cluster_results = cluster_results.sort_values(by=['cluster', 'snp'])
        file_name = cluster_results_to_csv(cluster_results)

        # Visualize the Clusters on the SOM
        fig = go.Figure()

        # Create a heatmap for the SOM distance map
        distance_map = som.distance_map().T  # Transpose to align with Plotly's heatmap orientation
        heatmap = go.Heatmap(
            z=distance_map,
            colorscale='cividis',
            colorbar=dict(title='Distance'),
            showscale=True,
        )
        fig.add_trace(heatmap)

        # Add scatter plots for each cluster
        for cluster in range(n_clusters):
            cluster_data = results_df[results_df['cluster'] == cluster]
            hover_texts = []
            for _, row in cluster_data.iterrows():
                phenotype_details = "<br>".join([
                    f"Phenotype: {phewas_string[:10]}..., Odds Ratio: {or_value:.2f}, P-Value: {p:.4f}"
                    for phewas_string, or_value, p in zip(row['phenotypes'], row['odds_ratios'], row['p_values'])
                ])
                hover_text = (
                    f"SNP: {row['snp']}<br>"
                    f"{phenotype_details}"
                )
                hover_texts.append(hover_text)

            # Add a scatter plot for the cluster
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

        # Update the layout of the figure
        fig.update_layout(
            title='SOM Clusters of SNPs with Detailed Hover Information',
            xaxis=dict(title='SOM X', showgrid=False, zeroline=False),
            yaxis=dict(title='SOM Y', showgrid=False, zeroline=False),
            plot_bgcolor='black',
            height=800,
            width=800,
            legend=dict(
                x=1.06,
                y=0.7,
                bgcolor='rgba(0,0,0,0)'
            )
        )

        # Update the colorbar of the figure to improve visibility
        fig.data[0].colorbar.update(
            thickness=15,
            x=1.005,
            len=0.8
        )

        # Render the visualization
        graph_div = pio.to_html(fig, full_html=False)

        # Prepare the context for the template
        context = {
            'graph_div': graph_div,
            'csv_path': settings.MEDIA_URL + file_name,
            'type': 'allele'
        }

        # Return the rendered HTML
        return render(request, 'som/som_view.html', context)


def initialise_som(x_normalized):
    """
    Static method to initialize and train the SOM.
    :param x_normalized:
    :return:
    """
    # Initialize and Train the SOM
    som_x = int(np.sqrt(5 * np.sqrt(x_normalized.shape[0])))
    som_y = int(np.sqrt(5 * np.sqrt(x_normalized.shape[0])))
    input_len = x_normalized.shape[1]
    som = MiniSom(x=som_x, y=som_y, input_len=input_len, sigma=1.0, learning_rate=0.5)
    som.random_weights_init(x_normalized)
    som.train_random(x_normalized, 10000)
    # Get Winning Positions for Each Disease
    positions = np.array([som.winner(x) for x in x_normalized])
    return positions, som


class SOMDiseaseView(APIView):
    def get(self, request):
        # Get the data_id from the request (passed as a query parameter)
        data_id = request.GET.get('data_id')
        # Get the number of clusters from the request (passed as a query parameter)
        num_clusters = request.GET.get('num_clusters')
        filters = request.GET.get('filters')
        if num_clusters is None:
            num_clusters = 5

        # Retrieve the temporary CSV data object using the data_id
        temp_data = get_object_or_404(TemporaryCSVData, id=data_id)

        # Convert the CSV content to a DataFrame
        csv_content = temp_data.csv_content
        df = pd.read_csv(StringIO(csv_content))

        # Preprocessing
        filtered_df = df[df['subtype'] != 0]  # Keep only 4-digit HLA alleles
        filtered_df = filtered_df[filtered_df['p'] < 0.05]  # Only keep statistically significant associations
        filtered_df['snp'] = filtered_df['snp'].str.replace('HLA_', '')  # Remove the prefix "HLA_"

        # Group by Disease
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

        # Identify All Unique Alleles and One-Hot Encode Categorical Variables
        all_alleles = sorted(set(allele for alleles in grouped_df['snp'] for allele in alleles))
        ohe = OneHotEncoder(sparse_output=False)
        gene_name_encoded = ohe.fit_transform(
            grouped_df['gene_name'].apply(lambda x: ','.join(set(x))).str.get_dummies(sep=',')
        )
        category_encoded = ohe.fit_transform(grouped_df[['category_string']])
        encoded_features = np.hstack([gene_name_encoded, category_encoded])

        # Create a Feature Matrix Including One-Hot Encoded Features
        def create_allele_features(row, alleles, allele_weight=5):
            features = defaultdict(float)
            for allele, p, or_value in zip(row['snp'], row['p'], row['odds_ratio']):
                features[allele] = or_value * allele_weight
            allele_features = [features[allele] for allele in alleles]
            return np.hstack([allele_features, encoded_features[row.name]])

        features_matrix = grouped_df.apply(create_allele_features, alleles=all_alleles, axis=1)
        x = np.array(features_matrix.tolist())
        scaler = StandardScaler()
        x_normalized = scaler.fit_transform(x)

        positions, som = initialise_som(x_normalized)

        # Create a DataFrame with Results
        results_df = pd.DataFrame({
            'phewas_string': grouped_df['phewas_string'],
            'x': positions[:, 0],
            'y': positions[:, 1],
            'p_values': grouped_df['p'],
            'odds_ratios': grouped_df['odds_ratio'],
            'snps': grouped_df['snp']
        })

        # Clustering Diseases Using K-Means
        n_clusters = int(num_clusters)
        kmeans = KMeans(n_clusters=n_clusters, random_state=42)
        positions_df = pd.DataFrame(positions, columns=['x', 'y'])
        positions_df['cluster'] = kmeans.fit_predict(positions_df)

        # Merge clustering results with the original results_df
        results_df['cluster'] = positions_df['cluster']

        # Save the cluster results to a CSV file
        cluster_results = results_df[['phewas_string', 'cluster', 'snps', 'p_values', 'odds_ratios']]
        # Sort the cluster results by cluster number and then by disease name
        cluster_results = cluster_results.sort_values(by=['cluster', 'phewas_string'])
        file_name = cluster_results_to_csv(cluster_results)

        # Visualize the Clusters on the SOM
        fig = go.Figure()

        # Create a heatmap for the SOM distance map
        distance_map = som.distance_map().T  # Transpose to align with Plotly's heatmap orientation
        heatmap = go.Heatmap(
            z=distance_map,
            colorscale='cividis',
            colorbar=dict(title='Distance'),
            showscale=True,
        )
        fig.add_trace(heatmap)

        for cluster in range(n_clusters):
            cluster_data = results_df[results_df['cluster'] == cluster]
            hover_texts = []
            for _, row in cluster_data.iterrows():
                snp_details = "<br>".join([
                    f"SNP: {snp}, Odds Ratio: {or_value:.2f}, P-Value: {p:.4f}"
                    for snp, or_value, p in zip(row['snps'], row['odds_ratios'], row['p_values'])
                ])
                hover_text = (
                    f"Disease: {row['phewas_string']}<br>"
                    f"{snp_details}"
                )
                hover_texts.append(hover_text)

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

        fig.update_layout(
            title='SOM Clusters of Diseases with Detailed Hover Information',
            xaxis=dict(title='SOM X', showgrid=False, zeroline=False),
            yaxis=dict(title='SOM Y', showgrid=False, zeroline=False),
            plot_bgcolor='black',
            height=800,
            width=800,
            legend=dict(
                x=1.06,
                y=0.7,
                bgcolor='rgba(0,0,0,0)'
            )
        )

        fig.data[0].colorbar.update(
            thickness=15,
            x=1.005,
            len=0.8
        )

        # Render the visualization
        graph_div = pio.to_html(fig, full_html=False)

        # Get categories
        categories = HlaPheWasCatalog.objects.values('category_string').distinct()
        # Sort the categories
        categories = sorted([category['category_string'] for category in categories])

        # Prepare the context for the template
        context = {
            'graph_div': graph_div,
            'csv_path': f"{settings.MEDIA_URL}{file_name}",
            "type": "disease",
            "categories": categories,
            "filters": filters if filters is not None else categories,
            "num_clusters": num_clusters
        }

        # Return the rendered HTML
        return render(request, 'som/som_view.html', context)
