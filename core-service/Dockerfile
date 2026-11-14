# Stage 1: Build
FROM eclipse-temurin:21-jdk-alpine AS builder
WORKDIR /workspace

COPY mvnw .
COPY .mvn .mvn
COPY pom.xml .
RUN ./mvnw dependency:go-offline -B || true

COPY src src
RUN ./mvnw clean package -DskipTests -B

# Stage 2: Runtime
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app

RUN apk add --no-cache curl

COPY --from=builder /workspace/target/core-service-0.1.0.jar app.jar

EXPOSE 8080
ENV SERVER_PORT=8080

ENTRYPOINT ["java", "-jar", "app.jar"]
