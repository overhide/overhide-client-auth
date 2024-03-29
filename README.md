<p align="center"><a href="https://github.com/overhide"><img src="./main/static/lib/logo.png" width="200px"/></a></p>

<p align="center"><a href="https://overhide.io">overhide.io</a></p><p style="width: 500px; margin: auto">A free and fully open-sourced ecosystem of widgets, a front-end library, and back-end services &mdash; to make addition of "logins" and "in-app-purchases" (IAP) to your app as banal as possible.</p>

<hr/>

# overhide-client-auth

Client API key registration, token retrieval, and validation.

Tokens retrieved with this service are used to authorize into other *overhide* services:  just provide as a `Bearer ${..}` token in the `Authorization` header.

> For help, reach out on [r/overhide](https://www.reddit.com/r/overhide/).

# Quick Start Docker

1. `npm install`
1. create a valid `.npmrc.dev` (from `.npmrc.sample` template)
1. `npm run compose-dev`
1. jump to "First Time DB Setup" section for the first-time DB setup
1. jump to "Database Evolutions" section, especially the "For Docker" subsection
1. your *oh-client-auth* container failed since your DB wasn't setup--now it is--find your *oh-ledger* container name: `docker ps -a`; look for *oh-client-auth* with an "Exited" status.
1. start it again: `docker start <container name>`
1. do a `docker logs <container name>` to make sure it's up
1. browse to http://localhost:8100/register

# Quick Start Non-Docker

1. `npm install`
1. jump to "First Time DB Setup" section for the first-time DB setup
1. `npm run start`

# Configuration

See [.npmrc.sample](.npmrc.sample).

Get the recaptcha keys from Google.  Set as `RECAPTCHA_SITE_KEY` and `RECAPTCHA_SECRET_KEY`.

# First Time DB Setup

All the DB connectivity configuration points assume that the DB and DB user are setup.

For localhost Docker, `psql` into the container:

```
npm run psql-dev
\c "oh-client-auth"
\dt
```



The 'adam' role and 'ohledger' DB should already be created and connected to with the above command (as per `.npmrc.dev` environment passed into docker-compose).

If not, to manually create:

```
postgres=# create database "oh-client-auth";
postgres=# create user adam with encrypted password 'c0c0nut';
postgres=# grant all privileges on database "oh-client-auth" to adam;
```

Make sure to set the configuration points in your *.npmrc* appropriately.

Now you're ready to run database evolutions on the new database.

# Database Evolutions

There is a single Node file to check for and perform database evolutions.

Run it from the application node with `npm run db-evolve`.

It will evolve the database to whatever it needs to be for the particular application version.

The *main/js/lib/database.js* has an *init(..)* method which should check that the database is at the right evolution for that version of the app.

Consider currently running nodes before evolving: will they be able to run with the evolved DB?  Perhaps stop them all before evolving.

## Check

To check the database pre/post evolution (first time DB setup already done):

- log into DB
- list tables

```
npm run psql-dev
\dt oh-client-auth.*
```

If you need to select role and DB:

```
set role oh-client-auth;
\c oh-client-auth;
```

More commands:  https://gist.github.com/apolloclark/ea5466d5929e63043dcf

## Evolve

If running using Docker, jump into a container to run the evolution:

`docker run -it --rm --link postgres:postgres --network oh_default oh-client-auth /bin/sh`

Then run the evolution:

`npm run db-evolve`

# Rate Limiting

Access to these APIs is gated via config points:

- `RATE_LIMIT_MAX_REQUESTS_PER_WINDOW`
- `RATE_LIMIT_WINDOW_MS`

This only applies to requests with a token other than the `INTERNAL_TOKEN` (if set).  `INTERNAL_TOKEN` requests are not rate-limited.

All rate-limits are shared across nodes sharing the same `RATE_LIMIT_REDIS_NAMESPACE` if `RATE_LIMIT_REDIS_URI` is set to a redis instance.
