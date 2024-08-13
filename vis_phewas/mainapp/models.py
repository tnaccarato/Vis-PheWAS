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
    gene_class: The gene class.
    serotype: The serotype.
    subtype: The subtype.
    """

    class Meta:
        db_table = 'hla_phewas_catalog'
        verbose_name = 'HLA PheWAS Catalog'
        verbose_name_plural = 'HLA PheWAS Catalog'
        indexes = [
            models.Index(fields=['snp'], name='snp_idx'),
            models.Index(fields=['phewas_code'], name='phewas_code_idx'),
            models.Index(fields=['phewas_string'], name='phewas_string_idx'),
            models.Index(fields=['category_string'], name='category_string_idx'),
            models.Index(fields=['odds_ratio'], name='odds_ratio_idx'),
            models.Index(fields=['p'], name='p_value_idx'),
            models.Index(fields=['gene_name'], name='gene_name_idx'),
            models.Index(fields=['chromosome'], name='chromosome_idx'),
            models.Index(fields=['serotype'], name='serotype_idx'),
            models.Index(fields=['subtype'], name='subtype_idx'),
            models.Index(fields=['category_string', 'phewas_string']),
            models.Index(fields=['phewas_string', 'snp']),
            models.Index(fields=['snp', 'p']),
            models.Index(fields=['snp', 'odds_ratio']),
        ]

    snp = models.CharField(max_length=50)
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
    gene_class = models.IntegerField()
    serotype = models.CharField(max_length=10)
    subtype = models.CharField(max_length=10)

    def __str__(self):
        """Return a string representation of the model."""
        return self.snp
