<div align="center" style="padding:5px 10px 0 10px; background-color:#101c29;">

  <img src="../../../assets/docker/hub/parcelis-wordmark-singleimage-dark.png" alt="Parcelis Single-Image" width="600" />
</div>

#### Parcelis (PAR-suhl-iss) is an open-source property management platform for landlords, small operators, and local property teams.

# Parcelis Single Image

`parcelis/parcelis` bundles the Parcelis web application, API, background worker
runtime, documentation site, and nginx edge routing in one image.

Modular deployment reference:

### Deployment Architecture
![Parcelis modular deployment architecture](<../../../assets/docker/hub/parcelis-modular-deployment-architecture.png>)

[View the diagram in Lucid](https://lucid.app/lucidchart/844aa831-3d40-4c01-8708-bad13ac883e3/view).

Use the [single-image Compose stack](https://github.com/parcelis/parcelis/blob/main/docker-compose-single-image.yml) and its [environment template](https://github.com/parcelis/parcelis/blob/main/.env.production.example). This deployment still uses separate PostgreSQL, Redis, and MinIO services and a separate worker container built from the same image.

See the [deployment documentation](https://docs.parcelis.dev/) for setup and upgrades.
