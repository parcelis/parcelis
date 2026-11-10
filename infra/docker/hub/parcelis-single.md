<div align="center" style="padding:5px 10px 0 10px; background-color:#101c29;">

  <img src="../../../assets/docker/hub/parcelis-wordmark-singleimage-dark.png" alt="Parcelis Single-Image" width="600" />
</div>

#### Parcelis (PAR-suhl-iss) is an open-source property management platform for landlords, small operators, and local property teams.

# Parcelis Single Image

`parcelis/parcelis` packages the Parcelis web application, API, documentation,
nginx routing, and worker runtime in one image for the single-image deployment.
It provides the interface and application services for managing properties,
leases, and tenants through one exposed application port.

The application and worker run in separate containers using this same image.
It connects to PostgreSQL, Redis, and S3-compatible storage as external services.

### Deployment Architecture
![Parcelis single-image deployment architecture](../../../assets/docker/hub/parcelis-single-deployment-architecture.png)

[View the diagram in Lucid](https://lucid.app/lucidchart/68fb062e-a8ed-4cc1-ba55-3740d605434d/view).

Use the [single-image Compose stack](https://github.com/parcelis/parcelis/blob/main/docker-compose-single-image.yml)
and its [environment template](https://github.com/parcelis/parcelis/blob/main/.env.production.example).
Pin `PARCELIS_VERSION` to a release tag when deploying.

See the [deployment documentation](https://docs.parcelis.dev/) for setup and upgrades.
