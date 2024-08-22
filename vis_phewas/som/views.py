from collections import defaultdict

import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import plotly.io as pio
from api.models import TemporaryCSVData
from django.conf import settings
from django.shortcuts import render, get_object_or_404
from rest_framework.views import APIView
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler, OneHotEncoder

from som.som_utils import cluster_results_to_csv, preprocess_temp_data, initialise_som, \
    prepare_categories_for_context, create_title, style_visualisation

class SOMView(APIView):
    """
    View to generate and display the SOM visualisation
    """

    def get(self, request):
        """
        :param request: Request object with parameters data_id, num_clusters, som_type and filters
        :return: Rendered template with the SOM visualisation
        """
        # Get the parameters from the request
        data_id = request.GET.get('data_id')
        som_type = request.GET.get('type')
        print(som_type)
        # Set the default number of clusters based on the SOM type or get the number of clusters from the request
        num_clusters = request.GET.get('num_clusters', 7 if som_type == 'snp' else 5)
        # Get the filters from the request
        filters = request.GET.get('filters')

        # Process and visualise the SOM
        context = self.process_and_visualise_som(data_id, num_clusters, filters, som_type)
        # Render the template with the context
        return render(request, 'som/som_view.html', context)

    def process_and_visualise_som(self, data_id, num_clusters, filters, som_type):
        """
        Method to process data and generate SOM visualisation.

        :param data_id: ID of the temporary data
        :param num_clusters: Number of clusters
        :param filters: Filters string
        :param som_type: Type of the SOM (SNP or disease)
        """
        # Retrieve the temporary CSV data object using the data_id
        temp_data = get_object_or_404(TemporaryCSVData, id=data_id)
        filtered_df = preprocess_temp_data(temp_data)

        # Group the data based on the SOM type and engineer the features
        if som_type == 'snp':
            features_matrix, grouped_df = self.engineer_snp_features(filtered_df)

        else:
            features_matrix, grouped_df = self.engineer_disease_features(filtered_df)

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
        results_df = self.construct_results_df(grouped_df, positions_df, som_type)

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
            'type': som_type,
            'categories': categories,
            'num_clusters': num_clusters,
            'filters': filters if filters else categories,
            'cleaned_filters': cleaned_filters
        }

    def construct_results_df(self, grouped_df, positions_df, som_type):
        """
        Helper method to construct the results DataFrame based on the SOM type.
        :param grouped_df: The grouped DataFrame
        :param positions_df: The positions DataFrame
        :param som_type: Type of the SOM (SNP or disease)
        :return:
        """
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
        return results_df

    def engineer_disease_features(self, filtered_df):
        """
        Helper method to engineer the features for the disease SOM.
        :param filtered_df: Filtered DataFrame
        :return: Features matrix and grouped DataFrame
        """
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
            """
            Function to create the allele features for each row.
            :param df_row: The row of the DataFrame
            :return: The combined features
            """
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
        return features_matrix, grouped_df

    def engineer_snp_features(self, filtered_df):
        """
        Helper method to engineer the features for the SNP SOM.
        :param filtered_df: Filtered DataFrame
        :return: Features matrix and grouped DataFrame
        """
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
            """
            Function to create the phenotype features for each row.
            :param df_row: The row of the DataFrame
            :return: The combined features
            """
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
        return features_matrix, grouped_df

