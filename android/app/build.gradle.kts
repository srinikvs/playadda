plugins {
    id("com.android.application")
}

val webAssets = layout.buildDirectory.dir("generated/web-assets")

tasks.register<Exec>("syncWebAssets") {
    val script = rootProject.file("tools/sync_web.py")
    val repo = rootProject.projectDir.parentFile
    commandLine(
        "python3",
        script.absolutePath,
        "--repo",
        repo.absolutePath,
        "--android",
        rootProject.projectDir.absolutePath,
        "--out",
        webAssets.get().asFile.absolutePath,
    )
    inputs.file(script)
    inputs.file(repo.resolve("index.html"))
    inputs.file(repo.resolve("favicon.svg"))
    inputs.dir(repo.resolve("js"))
    inputs.dir(rootProject.file("prebuilt"))
    inputs.dir(rootProject.file("vendor-fonts"))
    outputs.dir(webAssets)
}

android {
    namespace = "dev.playadda.portal"
    compileSdk = 35

    defaultConfig {
        applicationId = "dev.playadda.portal"
        minSdk = 26
        targetSdk = 35
        versionCode = 10205
        versionName = "1.2.5"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        buildConfig = true
    }

    androidResources {
        noCompress += listOf("js", "mjs", "css", "html", "svg", "json", "wasm", "woff", "woff2", "txt")
    }

    sourceSets.getByName("main").assets.srcDir(webAssets)
}

tasks.named("preBuild").configure {
    dependsOn("syncWebAssets")
}

configurations.configureEach {
    resolutionStrategy {
        // androidx.webkit pulls an older kotlin-stdlib-jdk8 that duplicates
        // classes already inside kotlin-stdlib 1.8+.
        force(
            "org.jetbrains.kotlin:kotlin-stdlib:1.9.25",
            "org.jetbrains.kotlin:kotlin-stdlib-jdk7:1.9.25",
            "org.jetbrains.kotlin:kotlin-stdlib-jdk8:1.9.25",
        )
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.activity:activity:1.9.3")
}
