# Generated by Django 5.0.6 on 2024-06-05 17:54

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('mainapp', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='hlaphewascatalog',
            name='snp',
            field=models.CharField(default='default', max_length=50),
            preserve_default=False,
        ),
    ]
