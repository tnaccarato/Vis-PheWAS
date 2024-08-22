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
from scipy.sparse import csr_matrix, hstack, vstack
from collections import defaultdict
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

        # Apply dimensionality reduction with TruncatedSVD to reduce the number of features for the SOM if needed
        reduced_features_matrix = self.perform_dimensionality_reduction(features_matrix)

        # Standardise the data without converting to dense format to save memory
        scaler = StandardScaler(with_mean=False)
        x_normalised = scaler.fit_transform(reduced_features_matrix)

        # Ensure the SOM input is dense
        if not isinstance(x_normalised, np.ndarray):
            x_normalised = x_normalised.toarray() # Convert to dense format

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

            # Add the cluster data to the visualisation
            fig.add_trace(go.Scatter(
                x=cluster_data['x'],
                y=cluster_data['y'],
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

    def perform_dimensionality_reduction(self, features_matrix):
        """
        Helper method to perform dimensionality reduction using TruncatedSVD if the number of features exceeds 100.
        :param features_matrix:
        :return:
        """
        if features_matrix.shape[1] > 100:
            # Ensure input is sparse before applying TruncatedSVD
            if not isinstance(features_matrix, csr_matrix):
                features_matrix = csr_matrix(features_matrix)
            # Perform TruncatedSVD with 100 components, but ensure it doesn’t exceed available features
            svd = TruncatedSVD(n_components=min(100, features_matrix.shape[1] - 1), random_state=42)
            reduced_features_matrix = svd.fit_transform(features_matrix)
        else:
            # If there are fewer than 100 features, skip SVD and use the original features matrix
            reduced_features_matrix = features_matrix
        return reduced_features_matrix

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
        Helper method to engineer the features for the SOM (Self-Organising Map) based on the specified type.

        :param filtered_df: Filtered DataFrame containing the input data.
        :param som_type: Type of the SOM ('snp' or 'disease').
            - 'snp': Groups the data by SNP and generates features based on associated phenotypes.
            - 'disease': Groups the data by disease and generates features based on associated SNPs and gene categories.

        :return: Features matrix (sparse) and grouped DataFrame.
        """

        # For disease-based SOM, group data by 'phewas_string' (disease identifier)
        if som_type == 'disease':
            # Group and aggregate relevant columns
            grouped_df = filtered_df.groupby('phewas_string').agg({
                'snp': list,  # List of SNPs associated with each disease
                'gene_name': list,  # List of gene names associated with each disease
                'p': list,  # List of p-values
                'odds_ratio': list,  # List of odds ratios
                'category_string': 'first',  # Single category (as it's categorical)
                'l95': list,  # Lower confidence interval
                'u95': list,  # Upper confidence interval
                'maf': list,  # Minor allele frequency
            }).reset_index()

            # Encode gene names and categories as sparse matrices
            ohe_gene = OneHotEncoder(sparse_output=True)
            ohe_category = OneHotEncoder(sparse_output=True)

            # Encode gene names (as a comma-separated string for unique encoding)
            gene_name_encoded = ohe_gene.fit_transform(
                grouped_df['gene_name'].apply(lambda x: ','.join(set(x))).str.get_dummies(sep=',')
            )

            # Encode the categorical disease categories
            category_encoded = ohe_category.fit_transform(grouped_df[['category_string']])

            # Combine the encoded gene and category features into a sparse matrix
            encoded_features = hstack([gene_name_encoded, category_encoded])

            # Function to create combined features for each disease
            def create_combined_features(df_row):
                features = defaultdict(float)
                # Map odds ratios to each SNP, scaled for better visualisation
                for allele, or_value in zip(df_row['snp'], df_row['odds_ratio']):
                    features[allele] = or_value * 5
                # Create a sparse feature vector for all alleles
                allele_features = csr_matrix([features.get(allele, 0) for allele in ohe_gene.categories_[0]])
                # Combine allele features with encoded gene and category features
                return hstack([allele_features, encoded_features[df_row.name]])

        else:  # For SNP-based SOM
            # Group data by 'snp' and aggregate relevant columns
            grouped_df = filtered_df.groupby('snp').agg({
                'phewas_string': list,  # List of phenotypes associated with each SNP
                'p': list,  # List of p-values
                'odds_ratio': list,  # List of odds ratios
                'category_string': list,  # List of category strings
                'l95': list,  # Lower confidence interval
                'u95': list,  # Upper confidence interval
                'maf': list,  # Minor allele frequency
            }).reset_index()

            # Explode the dataframe to separate out each phenotype and category into individual rows
            exploded_df = grouped_df.explode('phewas_string').explode('category_string')

            # Initialise one-hot encoders for phenotypes and categories
            ohe_phenotype = OneHotEncoder(sparse_output=True)
            ohe_category = OneHotEncoder(sparse_output=True)

            # Encode the phenotypes and categories into sparse matrices
            phenotype_encoded = ohe_phenotype.fit_transform(exploded_df[['phewas_string']])
            category_encoded = ohe_category.fit_transform(exploded_df[['category_string']])

            # Convert the 'snp' column to a numerical index for sparse matrix creation
            snp_mapping, _ = pd.factorize(exploded_df['snp'])
            n_snps = len(set(snp_mapping))

            # Create a sparse matrix indexed by SNP for phenotypes
            phenotype_aggregated = csr_matrix((phenotype_encoded.data, (snp_mapping, phenotype_encoded.indices)),
                                              shape=(n_snps, phenotype_encoded.shape[1]))

            # Create a sparse matrix indexed by SNP for categories
            category_aggregated = csr_matrix((category_encoded.data, (snp_mapping, category_encoded.indices)),
                                             shape=(n_snps, category_encoded.shape[1]))

            # Combine phenotype and category features into a single sparse matrix
            encoded_features = hstack([phenotype_aggregated, category_aggregated])

            # Function to create combined features for each SNP
            def create_combined_features(df_row):
                features = defaultdict(float)
                # Map odds ratios to each phenotype, scaled for better visualisation
                for phenotype, or_value in zip(df_row['phewas_string'], df_row['odds_ratio']):
                    features[phenotype] = or_value * 5
                # Create a sparse feature vector for all phenotypes
                phenotype_features = csr_matrix(
                    [features.get(phenotype, 0) for phenotype in ohe_phenotype.categories_[0]])
                # Combine phenotype features with encoded categorical features
                return hstack([phenotype_features, encoded_features[df_row.name]])

        # Apply the feature creation function across the grouped DataFrame
        features_matrix = vstack(grouped_df.apply(create_combined_features, axis=1).values)

        # Return the final sparse features matrix and the grouped DataFrame
        return features_matrix, grouped_df




