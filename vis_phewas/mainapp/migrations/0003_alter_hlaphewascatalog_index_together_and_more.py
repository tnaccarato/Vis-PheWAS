# Generated by Django 5.0.7 on 2024-08-02 14:48

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('mainapp', '0002_hlaphewascatalog_snp'),
    ]

    operations = [
        migrations.AlterIndexTogether(
            name='hlaphewascatalog',
            index_together={('category_string', 'phewas_string'), ('phewas_string', 'snp'), ('snp', 'odds_ratio'), ('snp', 'p')},
        ),
        migrations.AddIndex(
            model_name='hlaphewascatalog',
            index=models.Index(fields=['snp'], name='snp_idx'),
        ),
        migrations.AddIndex(
            model_name='hlaphewascatalog',
            index=models.Index(fields=['phewas_code'], name='phewas_code_idx'),
        ),
        migrations.AddIndex(
            model_name='hlaphewascatalog',
            index=models.Index(fields=['phewas_string'], name='phewas_string_idx'),
        ),
        migrations.AddIndex(
            model_name='hlaphewascatalog',
            index=models.Index(fields=['category_string'], name='category_string_idx'),
        ),
        migrations.AddIndex(
            model_name='hlaphewascatalog',
            index=models.Index(fields=['odds_ratio'], name='odds_ratio_idx'),
        ),
        migrations.AddIndex(
            model_name='hlaphewascatalog',
            index=models.Index(fields=['p'], name='p_value_idx'),
        ),
        migrations.AddIndex(
            model_name='hlaphewascatalog',
            index=models.Index(fields=['gene_name'], name='gene_name_idx'),
        ),
        migrations.AddIndex(
            model_name='hlaphewascatalog',
            index=models.Index(fields=['chromosome'], name='chromosome_idx'),
        ),
        migrations.AddIndex(
            model_name='hlaphewascatalog',
            index=models.Index(fields=['serotype'], name='serotype_idx'),
        ),
        migrations.AddIndex(
            model_name='hlaphewascatalog',
            index=models.Index(fields=['subtype'], name='subtype_idx'),
        ),
    ]
