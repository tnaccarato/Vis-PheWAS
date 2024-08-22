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
from scipy import sparse
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from som.som_utils import cluster_results_to_csv, preprocess_temp_data, initialise_som, \
    prepare_categories_for_context, create_title, style_visualisation
from sklearn.decomposition import TruncatedSVD


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

        # Engineer features based on the SOM type
        features_matrix, grouped_df = self.engineer_features(filtered_df, som_type)

        # Apply dimensionality reduction with TruncatedSVD to reduce the number of features for the SOM
        svd = TruncatedSVD(n_components=100, random_state=42)
        reduced_features_matrix = svd.fit_transform(features_matrix)

        # Standardize the data without converting to dense format to save memory
        scaler = StandardScaler(with_mean=False)
        x_normalised = scaler.fit_transform(reduced_features_matrix)

        # SOM training and positions
        positions, som = initialise_som(x_normalised)
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
        :return: Results DataFrame
        """
        # Common columns
        results_data = {
            'x': positions_df['x'],
            'y': positions_df['y'],
            'p_values': grouped_df['p'],
            'odds_ratios': grouped_df['odds_ratio']
        }

        # Add specific columns based on SOM type
        if som_type == 'snp':
            results_data.update({
                'snp': grouped_df['snp'],
                'phenotypes': grouped_df['phewas_string']
            })
        else:
            results_data.update({
                'phewas_string': grouped_df['phewas_string'],
                'snps': grouped_df['snp']
            })

        # Construct the final DataFrame
        results_df = pd.DataFrame(results_data)
        return results_df

    def engineer_features(self, filtered_df, som_type):
        """
        Helper method to engineer the features for the SOM based on the specified type.
        :param filtered_df: Filtered DataFrame
        :param som_type: Type of the SOM ('snp' or 'disease')
        :return: Features matrix and grouped DataFrame
        """
        # Determine the grouping column and aggregation logic based on the SOM type
        if som_type == 'disease':
            group_by_col = 'phewas_string'  # Group by disease identifier
            aggregation = {
                'snp': list,  # Collect all SNPs associated with the disease
                'gene_name': list,  # Collect all gene names associated with the disease
                'p': list,  # Collect p-values
                'odds_ratio': list,  # Collect odds ratios
                'category_string': 'first',  # Keep the first category string as it’s categorical
                'l95': list,  # Collect lower confidence interval
                'u95': list,  # Collect upper confidence interval
                'maf': list,  # Collect minor allele frequency
            }
        else:
            group_by_col = 'snp'  # Group by SNP identifier
            aggregation = {
                'phewas_string': list,  # Collect all phenotypes associated with the SNP
                'p': list,  # Collect p-values
                'odds_ratio': list,  # Collect odds ratios
                'category_string': list,  # Collect category strings
                'l95': list,  # Collect lower confidence interval
                'u95': list,  # Collect upper confidence interval
                'maf': list,  # Collect minor allele frequency
            }

        # Group the data based on the specified grouping column and apply the aggregation
        grouped_df = filtered_df.groupby(group_by_col).agg(aggregation).reset_index()

        if som_type == 'disease':
            # For disease-based SOM, extract unique alleles across all groups
            all_alleles = sorted(set(allele for alleles in grouped_df['snp'] for allele in alleles))
            # Initialize one-hot encoder for gene names and categories
            ohe = OneHotEncoder(sparse_output=True)

            # Encode the gene names (flattening into a comma-separated string for unique encoding)
            gene_name_encoded = ohe.fit_transform(
                grouped_df['gene_name'].apply(lambda x: ','.join(set(x))).str.get_dummies(sep=',')
            )

            # Encode the categorical disease categories
            category_encoded = ohe.fit_transform(grouped_df[['category_string']])

            # Combine the encoded gene and category features into a sparse matrix
            encoded_features = sparse.hstack([gene_name_encoded, category_encoded])

            # Function to create allele features for each disease
            def create_combined_features(df_row):
                features = defaultdict(float)
                # Scale the odds ratio by 5 for better visualization and map it to each allele
                for allele, p, or_value in zip(df_row['snp'], df_row['p'], df_row['odds_ratio']):
                    features[allele] = or_value * 5
                # Create a sparse feature vector for all alleles
                allele_features = sparse.csr_matrix([features[allele] for allele in all_alleles])
                # Combine allele features with encoded gene and category features, keeping everything sparse
                return sparse.hstack([allele_features, encoded_features[df_row.name]])

        else:  # If som_type == 'snp'
            # For SNP-based SOM, extract unique phenotypes across all groups
            all_phenotypes = set([phenotype for phenotypes in grouped_df['phewas_string'] for phenotype in phenotypes])
            # Explode the dataframe to separate out each category and phenotype into separate rows
            exploded_df = grouped_df.explode('phewas_string').explode('category_string')

            # Initialize one-hot encoders for phenotypes and categories
            ohe_phenotype = OneHotEncoder(sparse_output=True)
            ohe_category = OneHotEncoder(sparse_output=True)

            # Encode the phenotypes and categories into sparse matrices
            phenotype_encoded = ohe_phenotype.fit_transform(exploded_df[['phewas_string']])
            category_encoded = ohe_category.fit_transform(exploded_df[['category_string']])

            # Aggregate encoded features back by SNP into sparse matrices
            phenotype_aggregated = pd.DataFrame.sparse.from_spmatrix(
                phenotype_encoded,
                columns=ohe_phenotype.categories_[0],
                index=exploded_df['snp']
            ).groupby('snp').sum()

            category_aggregated = pd.DataFrame.sparse.from_spmatrix(
                category_encoded,
                columns=ohe_category.categories_[0],
                index=exploded_df['snp']
            ).groupby('snp').sum()

            # Ensure both matrices have the same SNPs and consistent shape
            common_snps = phenotype_aggregated.index.intersection(category_aggregated.index)
            phenotype_aggregated = phenotype_aggregated.loc[common_snps]
            category_aggregated = category_aggregated.loc[common_snps]

            # Convert matrices to sparse format if necessary
            phenotype_aggregated = sparse.csr_matrix(phenotype_aggregated)
            category_aggregated = sparse.csr_matrix(category_aggregated)

            # Perform hstack to combine phenotype and category features, keeping everything sparse
            encoded_features = sparse.hstack([phenotype_aggregated, category_aggregated])

            # Function to create phenotype features for each SNP
            def create_combined_features(df_row):
                features = defaultdict(float)
                # Scale the odds ratio by 5 for better visualization and map it to each phenotype
                for phenotype, p, or_value in zip(df_row['phewas_string'], df_row['p'], df_row['odds_ratio']):
                    features[phenotype] = or_value * 5
                # Create a sparse feature vector for all phenotypes
                phenotype_features = sparse.csr_matrix([features[phenotype] for phenotype in all_phenotypes])
                # Combine phenotype features with encoded categorical features, keeping everything sparse
                return sparse.hstack([phenotype_features, encoded_features[df_row.name]])

        # Apply the function to create the features matrix, keeping it sparse
        features_matrix = grouped_df.apply(create_combined_features, axis=1)

        # Convert the resulting Series of sparse matrices into a sparse matrix
        features_matrix = sparse.vstack(features_matrix.values)

        return features_matrix, grouped_df



