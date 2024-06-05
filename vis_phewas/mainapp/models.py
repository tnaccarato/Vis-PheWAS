from django.db import models


class HlaPheWasCatalog(models.Model):
    """
    Model representing a HLA PheWas Catalog entry.

    Fields:
    snp: The SNP identifier.
    phewas_code: The PheWas code.
    phewas_string: The PheWas string.
    cases: The number of cases.
    controls: The number of controls.
    category_string: The disease category string.
    odds_ratio: The odds ratio of the SNP.
    p: The p-value.
    l95: The lower 95% confidence interval.
    u95: The upper 95% confidence interval.
    gene_name: The gene name.
    maf: The minor allele frequency.
    a1: The first allele.
    a2: The second allele.
    chromosome: The chromosome number.
    nchrobs: The number of chromosome observations.
    """
    snp = models.CharField(max_length=100)
    phewas_code = models.FloatField()
    phewas_string = models.CharField(max_length=255)
    cases = models.IntegerField()
    controls = models.IntegerField()
    category_string = models.CharField(max_length=100)
    odds_ratio = models.FloatField()
    p = models.FloatField()
    l95 = models.FloatField()
    u95 = models.FloatField()
    gene_name = models.CharField(max_length=50)
    maf = models.FloatField()
    a1 = models.CharField(max_length=10)
    a2 = models.CharField(max_length=10)
    chromosome = models.IntegerField()
    nchrobs = models.IntegerField()

    def __str__(self):
        return self.snp
