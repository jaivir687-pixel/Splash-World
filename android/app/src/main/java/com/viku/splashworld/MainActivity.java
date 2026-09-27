package com.viku.splashworld;

import android.annotation.SuppressLint;
import android.app.AlertDialog;
import android.app.ProgressDialog;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.Display;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.SslErrorHandler;
import android.net.http.SslError;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import com.getcapacitor.BridgeActivity;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.Executors;

public class MainActivity extends BridgeActivity {

    private static final int REQUEST_CODE_INSTALL_PERMISSION = 1001;
    private static final String GAME_URL = "https://splash-world.vercel.app";
    private File pendingApkFile;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().setFlags(
                WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,
                WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED
        );
        optimizeDisplayRefreshRate();
        enableImmersiveStickyMode();

        setupAndLoadGame();
        checkForUpdates();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            enableImmersiveStickyMode();
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void setupAndLoadGame() {
        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                WebView webView = getBridge().getWebView();
                webView.setFocusable(true);
                webView.setFocusableInTouchMode(true);
                webView.requestFocus();

                WebSettings settings = webView.getSettings();
                settings.setJavaScriptEnabled(true);
                settings.setDomStorageEnabled(true);
                settings.setDatabaseEnabled(true);
                settings.setAllowFileAccess(true);
                settings.setAllowContentAccess(true);
                settings.setCacheMode(WebSettings.LOAD_DEFAULT);
                settings.setMediaPlaybackRequiresUserGesture(false);

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
                }

                webView.setWebViewClient(new WebViewClient() {
                    @Override
                    public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                        handler.proceed();
                    }

                    @Override
                    public boolean shouldOverrideUrlLoading(WebView view, String url) {
                        view.loadUrl(url);
                        return true;
                    }
                });

                webView.loadUrl(GAME_URL);
            }
        } catch (Exception ignored) {
        }
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int action = event.getAction();
        int keyCode = event.getKeyCode();

        if (keyCode == KeyEvent.KEYCODE_BUTTON_A || keyCode == KeyEvent.KEYCODE_DPAD_CENTER) {
            if (getBridge() != null && getBridge().getWebView() != null) {
                WebView webView = getBridge().getWebView();
                if (action == KeyEvent.ACTION_DOWN) {
                    webView.dispatchKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_SPACE));
                } else if (action == KeyEvent.ACTION_UP) {
                    webView.dispatchKeyEvent(new KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_SPACE));
                }
            }
        }
        return super.dispatchKeyEvent(event);
    }

    @SuppressWarnings("deprecation")
    private void optimizeDisplayRefreshRate() {
        try {
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            Display display = getWindowManager().getDefaultDisplay();
            Display.Mode[] modes = display.getSupportedModes();
            Display.Mode maxMode = null;
            for (Display.Mode mode : modes) {
                if (maxMode == null || mode.getRefreshRate() > maxMode.getRefreshRate()) {
                    maxMode = mode;
                }
            }
            if (maxMode != null) {
                lp.preferredDisplayModeId = maxMode.getModeId();
                getWindow().setAttributes(lp);
            }
        } catch (Exception ignored) {
        }
    }

    @SuppressWarnings("deprecation")
    private void enableImmersiveStickyMode() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_FULLSCREEN
            );
        }
    }

    private void checkForUpdates() {
        Executors.newSingleThreadExecutor().execute(() -> {
            try {
                URL url = new URL("https://api.github.com/repos/jaivir687-pixel/Splash-World/releases/latest");
                HttpURLConnection connection = (HttpURLConnection) url.openConnection();
                connection.setRequestProperty("User-Agent", "SplashWorldApp");
                connection.setRequestProperty("Accept", "application/vnd.github.v3+json");
                connection.setConnectTimeout(10000);
                connection.setReadTimeout(10000);

                if (connection.getResponseCode() == 200) {
                    BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream()));
                    StringBuilder sb = new StringBuilder();
                    String line;
                    while ((line = reader.readLine()) != null) {
                        sb.append(line);
                    }
                    reader.close();

                    JSONObject json = new JSONObject(sb.toString());
                    String tagName = json.optString("tag_name", "");
                    JSONArray assets = json.optJSONArray("assets");

                    String apkUrl = null;
                    if (assets != null) {
                        for (int i = 0; i < assets.length(); i++) {
                            JSONObject asset = assets.getJSONObject(i);
                            String name = asset.optString("name", "");
                            if (name.endsWith(".apk")) {
                                apkUrl = asset.optString("browser_download_url", "");
                                break;
                            }
                        }
                    }

                    String currentVersion = getCurrentVersionName();
                    if (apkUrl != null && !apkUrl.isEmpty() && isNewerVersion(currentVersion, tagName)) {
                        final String downloadUrl = apkUrl;
                        final String latestVersion = tagName;
                        runOnUiThread(() -> showUpdateDialog(latestVersion, downloadUrl));
                    }
                }
            } catch (Exception ignored) {
            }
        });
    }

    private String getCurrentVersionName() {
        try {
            PackageInfo pInfo = getPackageManager().getPackageInfo(getPackageName(), 0);
            return pInfo.versionName != null ? pInfo.versionName : "1.0";
        } catch (Exception e) {
            return "1.0";
        }
    }

    private boolean isNewerVersion(String currentVersion, String latestTag) {
        if (latestTag == null || latestTag.isEmpty()) return false;
        String cleanCurrent = currentVersion.replaceAll("(?i)^v", "").trim();
        String cleanLatest = latestTag.replaceAll("(?i)^v", "").trim();

        if (cleanCurrent.equalsIgnoreCase(cleanLatest)) return false;

        String[] currentParts = cleanCurrent.split("\\.");
        String[] latestParts = cleanLatest.split("\\.");

        int length = Math.max(currentParts.length, latestParts.length);
        for (int i = 0; i < length; i++) {
            int currentPart = i < currentParts.length ? parseVersionPart(currentParts[i]) : 0;
            int latestPart = i < latestParts.length ? parseVersionPart(latestParts[i]) : 0;
            if (latestPart > currentPart) return true;
            if (latestPart < currentPart) return false;
        }
        return false;
    }

    private int parseVersionPart(String part) {
        try {
            return Integer.parseInt(part.replaceAll("[^0-9]", ""));
        } catch (Exception e) {
            return 0;
        }
    }

    private void showUpdateDialog(String latestVersion, String downloadUrl) {
        new AlertDialog.Builder(this)
                .setTitle("Update Available")
                .setMessage("A new version (" + latestVersion + ") of Splash World is available. Would you like to update now?")
                .setPositiveButton("Update", (dialog, which) -> startApkDownload(downloadUrl))
                .setNegativeButton("Cancel", (dialog, which) -> dialog.dismiss())
                .setCancelable(true)
                .show();
    }

    @SuppressWarnings("deprecation")
    private void startApkDownload(String downloadUrl) {
        ProgressDialog progressDialog = new ProgressDialog(this);
        progressDialog.setTitle("Downloading Update");
        progressDialog.setMessage("Please wait while the update is downloading...");
        progressDialog.setProgressStyle(ProgressDialog.STYLE_HORIZONTAL);
        progressDialog.setCancelable(false);
        progressDialog.setMax(100);
        progressDialog.show();

        Executors.newSingleThreadExecutor().execute(() -> {
            try {
                URL url = new URL(downloadUrl);
                HttpURLConnection connection = (HttpURLConnection) url.openConnection();
                connection.setConnectTimeout(15000);
                connection.setReadTimeout(15000);
                connection.connect();

                int fileLength = connection.getContentLength();
                File apkFile = new File(getExternalCacheDir(), "splashworld-update.apk");

                InputStream input = new BufferedInputStream(connection.getInputStream());
                FileOutputStream output = new FileOutputStream(apkFile);

                byte[] data = new byte[4096];
                long total = 0;
                int count;
                while ((count = input.read(data)) != -1) {
                    total += count;
                    if (fileLength > 0) {
                        int progress = (int) (total * 100 / fileLength);
                        runOnUiThread(() -> progressDialog.setProgress(progress));
                    }
                    output.write(data, 0, count);
                }

                output.flush();
                output.close();
                input.close();

                runOnUiThread(() -> {
                    progressDialog.dismiss();
                    installApk(apkFile);
                });
            } catch (Exception e) {
                runOnUiThread(() -> {
                    progressDialog.dismiss();
                    Toast.makeText(MainActivity.this, "Download failed: " + e.getMessage(), Toast.LENGTH_LONG).show();
                });
            }
        });
    }

    private void installApk(File apkFile) {
        if (!apkFile.exists()) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (!getPackageManager().canRequestPackageInstalls()) {
                pendingApkFile = apkFile;
                new AlertDialog.Builder(this)
                        .setTitle("Permission Required")
                        .setMessage("To install the update, please allow Splash World to install unknown apps in Settings.")
                        .setPositiveButton("Settings", (dialog, which) -> openInstallPermissionSettings())
                        .setNegativeButton("Cancel", null)
                        .show();
                return;
            }
        }

        launchInstaller(apkFile);
    }

    @SuppressWarnings("deprecation")
    private void openInstallPermissionSettings() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES)
                    .setData(Uri.parse("package:" + getPackageName()));
            startActivityForResult(intent, REQUEST_CODE_INSTALL_PERMISSION);
        }
    }

    private void launchInstaller(File apkFile) {
        Intent intent = new Intent(Intent.ACTION_VIEW);
        Uri apkUri = FileProvider.getUriForFile(
                this,
                getPackageName() + ".fileprovider",
                apkFile
        );
        intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(intent);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_CODE_INSTALL_PERMISSION) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (getPackageManager().canRequestPackageInstalls() && pendingApkFile != null) {
                    launchInstaller(pendingApkFile);
                }
            }
        }
    }
}