<div align="center" style="padding:5px 10px 0 10px; background-color:#101c29;">

  <img src="../../../assets/docker/hub/parcelis-wordmark-worker-dark.png" alt="Parcelis Worker" width="600" />
</div>

#### Parcelis (PAR-suhl-iss) is an open-source property management platform for landlords, small operators, and local property teams.

# Parcelis Worker

`parcelis/worker` runs Parcelis background jobs, including email notifications
and scheduled lease activation and expiration. It dispatches saved application
events, processes queued jobs, and retries temporary failures.

In the modular Compose stack, it runs separately from `parcelis/apps` and
connects to PostgreSQL, Redis, and the configured SMTP server.

## Deployment Architecture
![Parcelis modular deployment architecture](<../../../assets/docker/hub/parcelis-modular-deployment-architecture.png>)

[View the diagram in Lucid](https://lucid.app/lucidchart/844aa831-3d40-4c01-8708-bad13ac883e3/view).

Use the [modular Compose stack](https://github.com/parcelis/parcelis/blob/main/docker-compose.yml) and its [environment template](https://github.com/parcelis/parcelis/blob/main/.env.production.example). Choose a matching release tag for all Parcelis images in the stack.

See the [deployment documentation](https://docs.parcelis.dev/) for setup and upgrades.
