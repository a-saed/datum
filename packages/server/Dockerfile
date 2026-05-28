FROM golang:1.25-alpine AS build
WORKDIR /app
COPY packages/server/go.mod packages/server/go.sum ./
RUN go mod download
COPY packages/server/ .
RUN go build -o datum-server .

FROM alpine:3.20
RUN apk add --no-cache ca-certificates
WORKDIR /app
COPY --from=build /app/datum-server .
COPY datum.yaml .
EXPOSE 3000
ENTRYPOINT ["./datum-server"]
CMD ["-config", "/app/datum.yaml"]
