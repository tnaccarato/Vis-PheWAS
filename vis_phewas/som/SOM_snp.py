#%% md
# # Self-Organizing Maps for SNP Clustering
# 
# In this project, I use a Self-Organizing Map (SOM) to cluster SNPs based on their genetic associations with Human Leukocyte Antigen (HLA) alleles. The dataset used in this analysis is the HLA-PheWAS catalog, which contains information about the associations betIen HLA alleles and various SNPs.
#%% md
# ### Importing Libraries
# To start, I import all the necessary libraries that will be used throughout the analysis. These include libraries for data manipulation, machine learning, visualization, and self-organizing maps (SOM).
#%%
import pandas as pd
from collections import defaultdict
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from minisom import MiniSom
import numpy as np
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
import matplotlib.pyplot as plt
import plotly.express as px
import plotly.graph_objects as go

#%% md
# ## Data Preprocessing and Analysis
# 
# In this section, I load the HLA-PheWAS catalog dataset, preprocess the data, and analyze the associations between HLA alleles and diseases. The goal is to prepare the data for clustering using a Self-Organizing Map (SOM).
#%% md
# ### Load the Dataset
# I load the cleaned HLA-PheWAS catalog dataset into a DataFrame and display the first few rows to inspect its structure and contents.
# 
#%%
df = pd.read_csv('../../Data/hla-phewas-catalog-cleaned.csv')
print(df.head()) # Display the first few rows of the dataset

#%% md
# ### Filter The Dataset
# In this step, I filter the dataset to keep only rows with 4-digit HLA alleles and associations that are statistically significant (p-value < 0.05). Additionally, I clean the `snp` column by removing the prefix "HLA_".
# 
#%%
filtered_df = df[df['subtype'] != 0] # Keep only 4-digit HLA alleles
filtered_df = filtered_df[filtered_df['p'] < 0.05] # Only keep statistically significant associations
filtered_df['snp'] = filtered_df['snp'].str.replace('HLA_', '') # Remove the prefix "HLA_"

#%% md
# ### Group by Disease
# I group the data by the `snp` column, and aggregate the corresponding diseases (`phewas_string`s), gene names, p-values, odds ratios, confidence intervals, and minor allele frequencies. This gives us a consolidated view of each disease and its associated genetic data.
# 
#%%
grouped_df = filtered_df.groupby('snp').agg({
    'phewas_string': list,  # Aggregates phenotypes into a list for each SNP
    'p': list,              # Aggregates p-values into a list for each SNP
    'odds_ratio': list,     # Aggregates odds ratios into a list for each SNP
    'category_string': list,  # Category strings for the SNP
    'l95': list,            # Aggregates lower 95% confidence intervals into a list for each SNP
    'u95': list,            # Aggregates upper 95% confidence intervals into a list for each SNP
    'maf': list,            # Aggregates minor allele frequencies into a list for each SNP
}).reset_index()


#%% md
# ### Identify All Unique Phenotypes and One-Hot Encode Categorical Variables
# I identify all unique phenotypes across the dataset and then apply one-hot encoding to the `phewas_string` and `category_string` columns. This encoding transforms the categorical variables into a format suitable for machine learning models.
# 
#%%
# Identify all unique phenotypes
all_phenotypes = set([phenotype for phenotypes in grouped_df['phewas_string'] for phenotype in phenotypes])

# Explode the 'phewas_string' and 'category_string' lists
exploded_df = grouped_df.explode('phewas_string').explode('category_string')

# One-Hot Encode the 'phewas_string' and 'category_string'
# Separate encoders for each categorical feature
ohe_phenotype = OneHotEncoder(sparse_output=False)
ohe_category = OneHotEncoder(sparse_output=False)

# One-hot encode the 'phewas_string'
phenotype_encoded = ohe_phenotype.fit_transform(exploded_df[['phewas_string']])

# One-hot encode the 'category_string'
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

# Check the resulting feature matrix
print(encoded_features.shape)
#%% md
# ### Create a Feature Matrix Including One-Hot Encoded Features
# Here, I create a feature matrix that combines the phenotype features with the one-hot encoded features. Each phenotype is weighted by its odds ratio, which helps in capturing the association's strength.
# 
#%%
def create_phenotype_features(row, phenotypes, phenotype_weight=5):
    features = defaultdict(float)
    for phenotype, p, or_value in zip(row['phewas_string'], row['p'], row['odds_ratio']):
        features[phenotype] = or_value * phenotype_weight
    phenotype_features = [features[phenotype] for phenotype in phenotypes]
    return np.hstack([phenotype_features, encoded_features[row.name]])

features_matrix = grouped_df.apply(create_phenotype_features, phenotypes=all_phenotypes, axis=1)
X = np.array(features_matrix.tolist())
scaler = StandardScaler()
X_normalized = scaler.fit_transform(X)
#%% md
# ## Self-Organizing Map (SOM) Clustering
# 
# In this section, I implement the Self-Organizing Map (SOM) algorithm to cluster SNPs based on their genetic associations. The SOM is a type of artificial neural network that can reduce the dimensionality of data and capture the underlying structure of complex datasets. By training the SOM on the genetic data, we can visualize the relationships between SNPs in a lower-dimensional space.
#%% md
# ### Initialize and Train the SOM
# I initialize and train a Self-Organizing Map (SOM), which is an unsupervised learning algorithm used to map high-dimensional data into a loIr-dimensional space, while preserving the topological structure of the data.
# 
#%%
som_x = int(np.sqrt(5 * np.sqrt(X_normalized.shape[0])))
som_y = int(np.sqrt(5 * np.sqrt(X_normalized.shape[0])))
input_len = X_normalized.shape[1]
som = MiniSom(x=som_x, y=som_y, input_len=input_len, sigma=1.0, learning_rate=0.5)
som.random_weights_init(X_normalized)
som.train_random(X_normalized, 10000)

#%% md
# ### Get Winning Positions for Each SNP
# After training the SOM, I determine the winning position on the map for each SNP. This position represents where in the SOM the SNP's feature vector is most similar to the neurons in the map.
# 
#%%
positions = np.array([som.winner(x) for x in X_normalized])

#%% md
# ### Create a DataFrame with Results
# I create a DataFrame that includes the SOM positions for each SNP along with the original data (p-values, odds ratios, phenotypes). This will help in later visualization and analysis.
# 
#%%
results_df = pd.DataFrame({
    'snp': grouped_df['snp'],
    'x': positions[:, 0],
    'y': positions[:, 1],
    'p_values': grouped_df['p'],
    'odds_ratios': grouped_df['odds_ratio'],
    'phenotypes': grouped_df['phewas_string']
})

#%% md
# ## Clustering SNPs Using K-Means
# 
# In this section, I use K-Means clustering to group the SNPs based on their SOM positions. K-Means is a popular clustering algorithm that aims to partition n observations into k clusters in which each observation belongs to the cluster with the nearest mean. I first determine the optimal number of clusters using the Elbow Method and Silhouette Score, and then apply K-Means clustering to the SOM positions.
#%% md
# ### Determine the Optimal Number of Clusters Using K-Means
# 
# To determine the optimal number of clusters, I use the Elbow Method and Silhouette Score. The Elbow Method helps identify the inflection point where the Within-Cluster Sum of Squares (WCSS) stops decreasing significantly, while the Silhouette Score measures how similar an object is to its own cluster compared to other clusters.
# 
# 
#%%
# Compute the Within-Cluster Sum of Squares (WCSS) and Silhouette Scores for a range of clusters
wcss = []
silhouette_scores = []
range_n_clusters = range(2, 11)  # Trying 2 to 10 clusters

for n_clusters in range_n_clusters:
    kmeans = KMeans(n_clusters=n_clusters, random_state=42)
    cluster_labels = kmeans.fit_predict(X_normalized)
    
    wcss.append(kmeans.inertia_)
    silhouette_avg = silhouette_score(X_normalized, cluster_labels)
    silhouette_scores.append(silhouette_avg)

# Plotting the Elbow Method graph (WCSS)
plt.figure(figsize=(10, 5))
plt.plot(range_n_clusters, wcss, marker='o')
plt.title('Elbow Method For Optimal Number of Clusters')
plt.xlabel('Number of Clusters')
plt.ylabel('WCSS (Within-Cluster Sum of Squares)')
plt.show()

# Plotting the Silhouette Score graph
plt.figure(figsize=(10, 5))
plt.plot(range_n_clusters, silhouette_scores, marker='o')
plt.title('Silhouette Score For Optimal Number of Clusters')
plt.xlabel('Number of Clusters')
plt.ylabel('Silhouette Score')
plt.show()

#%% md
# ### Apply K-Means Clustering
# 
# Based on the Elbow Method and Silhouette Score, I choose the optimal number of clusters and apply K-Means clustering to the SOM positions. I then merge the clustering results with the original results DataFrame for further analysis.
#%%
n_clusters = 7  # Adjust the number of clusters as needed
kmeans = KMeans(n_clusters=n_clusters, random_state=42)
positions_df = pd.DataFrame(positions, columns=['x', 'y'])
positions_df['cluster'] = kmeans.fit_predict(positions_df)

# Merge clustering results with the original results_df
results_df['cluster'] = positions_df['cluster']

#%% md
# ### Visualize the Clusters on the SOM
# 
# I visualize the clusters on the SOM distance map using Plotly. Each cluster is represented by a different color, and detailed information about the SNPs in each cluster is displayed on hover. Additionally, I save the SNP information for each cluster to a CSV file for further analysis.
#%%
# Plot SOM distance map with Plotly
fig = go.Figure()

# Create a heatmap for the SOM distance map
distance_map = som.distance_map().T  # Transpose to align with Plotly's heatmap orientation
heatmap = go.Heatmap(
    z=distance_map,
    colorscale='cividis',
    colorbar=dict(title='Distance'),
    showscale=True,
)

# Add the heatmap to the figure
fig.add_trace(heatmap)

# Add clusters as scatter points with detailed hover labels
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
    
    fig.add_trace(go.Scatter(
        x=cluster_data['x'] + 0.5,
        y=cluster_data['y'] + 0.5,
        mode='markers',
        marker=dict(
            size=10,
            color=px.colors.qualitative.Dark24[cluster],  # Different color for each cluster
            opacity=0.8,
        ),
        text=hover_texts,
        hoverinfo='text'
    ))


fig.update_layout(
    title='SOM Clusters of SNPs with Detailed Hover Information',
    xaxis=dict(title='SOM X', showgrid=False, zeroline=False),
    yaxis=dict(title='SOM Y', showgrid=False, zeroline=False),
    plot_bgcolor='black',
    height=800,
    width=800,
    legend=dict(
        x=1.06,  # Move the legend slightly outside the plot area
        y=0.7,     # Align legend to the top
        bgcolor='rgba(0,0,0,0)'  # Make the legend background transparent
    )
)

# Update colorbar size and position
fig.data[0].colorbar.update(
    thickness=15,  # Adjust the thickness of the colorbar
    x=1.005,         # Move the colorbar slightly to the left
    len=0.8        # Adjust the length of the colorbar
)

# Show the figure
fig.show()

# Save each cluster's SNP information to a CSV file
for cluster in range(n_clusters):
    print(f"Saving cluster {cluster} to CSV...")
    cluster_data = results_df[results_df['cluster'] == cluster]
    cluster_data.to_csv(f'outputs/clusters/SNP_cluster_{cluster}.csv', index=False)

#%%
