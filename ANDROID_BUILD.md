# Android APK Build Instructions (Capacitor)

Prerequisites:
- Android Studio installed on your machine.
- Java/JDK installed.

1.  **Install Dependencies** (if you haven't already locally):
    ```bash
    npm install
    ```

2.  **Add Android Platform**:
    ```bash
    npx cap add android
    ```

3.  **Sync Web Assets**:
    This copies your `public` folder to the native Android project.
    ```bash
    npx cap sync
    ```

4.  **Open Android Studio**:
    ```bash
    npx cap open android
    ```
    Alternatively, open the `android/` folder manually in Android Studio.

5.  **Build APK**:
    - In Android Studio, wait for Gradle sync to finish.
    - Go to **Build > Build Bundle(s) / APK(s) > Build APK(s)**.
    - The APK will be generated in `android/app/build/outputs/apk/debug/app-debug.apk`.

6.  **Run on Device**:
    - Connect your Android phone via USB (Debugging enabled).
    - Click the **Run** (Play) button in Android Studio.
