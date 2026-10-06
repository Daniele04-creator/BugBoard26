FROM eclipse-temurin:21-jdk-alpine@sha256:0bfc69a4758a86710e5c474032d28400a8bd00874766f9e8b1642ac2fd293159 AS build
WORKDIR /workspace/backend
COPY backend/.mvn .mvn
COPY backend/mvnw backend/pom.xml ./
RUN chmod +x mvnw && ./mvnw -B -ntp dependency:go-offline
COPY config/quality /workspace/config/quality
COPY backend/src src
RUN ./mvnw -B -ntp -DskipTests package

FROM eclipse-temurin:21-jre-alpine@sha256:51ab5e3302e7141ce665ca3ea85e8b5cd648eafbc3c0c90dd79d6537684e4555
RUN addgroup -S bugboard && adduser -S bugboard -G bugboard
WORKDIR /app
COPY --from=build --chown=bugboard:bugboard /workspace/backend/target/bugboard26-0.1.0-SNAPSHOT.jar app.jar
RUN mkdir logs && chown bugboard:bugboard logs
USER bugboard
ENV JAVA_TOOL_OPTIONS="-Xmx1g -Djava.awt.headless=true -Duser.timezone=UTC"
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=4 CMD wget -q -O /dev/null http://127.0.0.1:8080/health/readiness || exit 1
ENTRYPOINT ["java", "-jar", "app.jar"]
