<div align="center" style="padding:5px 10px 0 10px; background-color:#101c29;">

  <img src="../../../assets/docker/hub/parcelis-banner-dark.png" alt="Parcelis" width="600" />
</div>

#### Parcelis (PAR-suhl-iss) is an open-source property management platform for landlords, small operators, and local property teams.

# Parcelis Docs

`parcelis/docs` packages the bundled Parcelis documentation site and serves its
static pages through nginx.

In the modular Compose stack, it runs alongside `parcelis/apps` and receives
requests at `/docs/` through `parcelis/proxy`.

## Deployment Architecture

![Parcelis modular deployment architecture](../../../assets/docker/hub/parcelis-modular-deployment-architecture.png)

[View the diagram in Lucid](https://lucid.app/lucidchart/844aa831-3d40-4c01-8708-bad13ac883e3/view).

Use the [modular Compose stack](../../../docker-compose.yml) and its [environment template](../../../.env.production.example). The application images `parcelis/apps`, `parcelis/proxy`, `parcelis/docs`, and `parcelis/worker` use `latest` tags. For a specific release, replace only these application image tags with that release tag. Keep `parcelis/minio:final` and `parcelis/minio-init:final` unchanged.

Maintained guides and API reference are available at [docs.parcelis.dev](https://docs.parcelis.dev/).
