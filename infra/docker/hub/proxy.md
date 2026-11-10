<div align="center" style="padding:5px 10px 0 10px; background-color:#101c29;">

  <img src="../../../assets/docker/hub/parcelis-wordmark-proxy-dark.png" alt="Parcelis Proxy" width="600" />
</div>

#### Parcelis (PAR-suhl-iss) is an open-source property management platform for landlords, small operators, and local property teams.

# Parcelis Proxy

`parcelis/proxy` provides the nginx reverse proxy for the modular Parcelis
deployment, giving browser requests a single entry point for the web application,
API, and documentation.

It routes requests directly to `parcelis/apps` and `parcelis/docs` on the
container network. The connection to the API passes through one trusted proxy
hop.

## Deployment Architecture

![Parcelis modular deployment architecture](../../../assets/docker/hub/parcelis-modular-deployment-architecture.png)

[View the diagram in Lucid](https://lucid.app/lucidchart/844aa831-3d40-4c01-8708-bad13ac883e3/view).

Use the [modular Compose stack](../../../docker-compose.yml) and its [environment template](../../../.env.production.example). The application images `parcelis/apps`, `parcelis/proxy`, `parcelis/docs`, and `parcelis/worker` use `latest` tags. For a specific release, replace only these application image tags with that release tag. Keep `parcelis/minio:final` and `parcelis/minio-init:final` unchanged.

See the [deployment documentation](https://docs.parcelis.dev/) for setup and TLS configuration.
