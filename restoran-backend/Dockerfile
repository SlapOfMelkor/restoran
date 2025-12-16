# ===========================
# 1. BUILD STAGE
# ===========================
FROM golang:1.24-alpine AS builder

WORKDIR /app

# Go mod dosyalarını kopyala ve bağımlılıkları indir
COPY go.mod go.sum ./
RUN go mod download

# Proje dosyalarının tamamını kopyala
COPY . .

# Statik, küçük bir binary üretelim
# -mod=mod: vendor dizinini ignore et, direkt mod cache kullan
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -mod=mod -o restoran-server ./cmd/server

# ===========================
# 2. RUN STAGE
# ===========================
FROM alpine:3.20

WORKDIR /app

# timezone, ca-certificates gibi ufak şeyler:
RUN apk add --no-cache ca-certificates tzdata

# Binary'yi kopyala
COPY --from=builder /app/restoran-server /app/restoran-server

# Varsayılan env'ler (docker-compose ile override edeceğiz)
ENV HTTP_PORT=8080

EXPOSE 8080

CMD ["./restoran-server"]
