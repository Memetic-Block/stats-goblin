job "analytics-goblin-stage" {
  datacenters = [ "mb-hel" ]
  type = "service"

  constraint {
    attribute = "${meta.env}"
    value     = "worker"
  }

  update {
    max_parallel      = 1
    health_check      = "checks"
    min_healthy_time  = "10s"
    healthy_deadline  = "5m"
    progress_deadline = "10m"
    auto_revert       = true
    auto_promote      = true
    canary            = 1
    stagger           = "30s"
  }

  group "analytics-goblin-stage-group" {
    count = 1

    network {
      mode = "bridge"
      port "http" {
        host_network = "wireguard"
      }
    }

    task "analytics-goblin-stage-task" {
      driver = "docker"

      config {
        image = "${CONTAINER_REGISTRY_ADDR}/memetic-block/analytics-goblin:${VERSION}"
      }

      env {
        VERSION="[[ .commit_sha ]]"
        PORT="${NOMAD_PORT_http}"
        
        # Application config
        TRUST_PROXY="true"
        CORS_ALLOWED_ORIGIN="*"
        
        # Client validation
        ALLOWED_CLIENT_NAMES="wuzzy-web"
        
        # Redis config
        REDIS_MODE="standalone"
        REDIS_PORT="6379"
        
        # Analytics config
        ALLOWED_APPLICATIONS="graphql-images,graphql-video,graphql-audio"
        MAX_QUERY_LENGTH="5000"
        MAX_BATCH_SIZE="50"
        MAX_QUERY_RESPONSE_HITS="100"
        BULK_CHUNK_SIZE="20"
        
        # OpenSearch config
        OPENSEARCH_USE_TLS="true"
        OPENSEARCH_SSL_VERIFY="false"
        OPENSEARCH_USERNAME="admin"
      }

      template {
        data = <<-EOF
        {{- range service "wuzzy-opensearch-stage-hel-1" }}
        OPENSEARCH_HOST="http://{{ .Address }}:{{ .Port }}"
        {{- end }}
        {{- range service "wuzzy-redis-stage-hel-1" }}
        REDIS_HOST="{{ .Address }}"
        {{- end }}
        {{- range service "container-registry" }}
        CONTAINER_REGISTRY_ADDR="{{ .Address }}:{{ .Port }}"
        {{- end }}
        EOF
        env = true
        destination = "local/config.env"
      }

      vault { policies = [ "wuzzy-opensearch-stage" ] }

      template {
        data = <<-EOF
        {{- with secret "kv/wuzzy/opensearch-stage" }}
        OPENSEARCH_PASSWORD="{{ .Data.data.OPENSEARCH_INITIAL_ADMIN_PASSWORD }}"
        {{- end }}
        EOF
        destination = "secrets/config.env"
        env = true
      }

      resources {
        cpu    = 512
        memory = 512
      }

      service {
        name = "analytics-goblin-stage"
        port = "http"

        check {
          type     = "http"
          path     = "/health"
          interval = "10s"
          timeout  = "10s"
        }

        tags = [
          "traefik.enable=true",
          
          # Rate limiting middleware
          "traefik.http.middlewares.analytics-goblin-stage-ratelimit.ratelimit.average=100",
          "traefik.http.middlewares.analytics-goblin-stage-ratelimit.ratelimit.burst=200",
          "traefik.http.middlewares.analytics-goblin-stage-ratelimit.ratelimit.period=1m",
          
          # CORS middleware
          "traefik.http.middlewares.analytics-goblin-stage-corsheaders.headers.accesscontrolallowmethods=GET,OPTIONS,PUT,POST,DELETE,HEAD,PATCH",
          "traefik.http.middlewares.analytics-goblin-stage-corsheaders.headers.accesscontrolallowheaders=*",
          "traefik.http.middlewares.analytics-goblin-stage-corsheaders.headers.accesscontrolalloworiginlist=*",
          "traefik.http.middlewares.analytics-goblin-stage-corsheaders.headers.accesscontrolmaxage=100",
          "traefik.http.middlewares.analytics-goblin-stage-corsheaders.headers.addvaryheader=true",
          
          # Router configuration with middlewares
          "traefik.http.routers.analytics-goblin-stage.middlewares=analytics-goblin-stage-ratelimit,analytics-goblin-stage-corsheaders",
          "traefik.http.routers.analytics-goblin-stage.entrypoints=https",
          "traefik.http.routers.analytics-goblin-stage.tls=true",
          "traefik.http.routers.analytics-goblin-stage.tls.certresolver=memetic-block",
          "traefik.http.routers.analytics-goblin-stage.rule=Host(`analytics-goblin-stage.hel.memeticblock.net`)"
        ]
      }
    }
  }
}
