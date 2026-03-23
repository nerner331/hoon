package com.hoonstore.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.provider.MediaStore
import android.view.View
import android.webkit.CookieManager
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.TextView
import android.widget.Toast
import androidx.activity.addCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import com.google.android.material.button.MaterialButton
import java.io.File
import java.io.IOException
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainActivity : AppCompatActivity() {
    private lateinit var swipeRefresh: SwipeRefreshLayout
    private lateinit var webView: WebView
    private lateinit var progressBar: View
    private lateinit var errorView: View
    private lateinit var errorTitle: TextView
    private lateinit var errorMessage: TextView
    private lateinit var retryButton: MaterialButton
    private lateinit var openBrowserButton: MaterialButton

    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null
    private var cameraImageUri: Uri? = null
    private var pendingPermissionRequest: PermissionRequest? = null
    private val appUrl by lazy { getString(R.string.app_url) }

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        handleCameraPermissionResult(granted)
    }

    private val fileChooserLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val callback = fileChooserCallback
        val imageUri = cameraImageUri
        fileChooserCallback = null
        cameraImageUri = null

        if (callback == null) {
            return@registerForActivityResult
        }

        if (result.resultCode != RESULT_OK) {
            callback.onReceiveValue(null)
            return@registerForActivityResult
        }

        val data = result.data
        val uris = when {
            data?.clipData != null -> {
                Array(data.clipData!!.itemCount) { index ->
                    data.clipData!!.getItemAt(index).uri
                }
            }
            data?.data != null -> arrayOf(data.data!!)
            imageUri != null -> arrayOf(imageUri)
            else -> null
        }

        callback.onReceiveValue(uris)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        bindViews()
        setupButtons()
        setupWebView()

        onBackPressedDispatcher.addCallback(this) {
            if (webView.canGoBack()) {
                webView.goBack()
            } else {
                finish()
            }
        }

        if (savedInstanceState == null) {
            webView.loadUrl(appUrl)
        } else {
            webView.restoreState(savedInstanceState)
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        webView.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    override fun onDestroy() {
        fileChooserCallback?.onReceiveValue(null)
        fileChooserCallback = null
        pendingPermissionRequest?.deny()
        pendingPermissionRequest = null
        webView.destroy()
        super.onDestroy()
    }

    private fun bindViews() {
        swipeRefresh = findViewById(R.id.swipeRefresh)
        webView = findViewById(R.id.webView)
        progressBar = findViewById(R.id.progressBar)
        errorView = findViewById(R.id.errorView)
        errorTitle = findViewById(R.id.errorTitle)
        errorMessage = findViewById(R.id.errorMessage)
        retryButton = findViewById(R.id.retryButton)
        openBrowserButton = findViewById(R.id.openBrowserButton)
    }

    private fun setupButtons() {
        swipeRefresh.setOnRefreshListener {
            webView.reload()
        }

        retryButton.setOnClickListener {
            hideErrorState()
            webView.reload()
        }

        openBrowserButton.setOnClickListener {
            openExternalUrl(appUrl)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        if (BuildConfig.DEBUG) {
            WebView.setWebContentsDebuggingEnabled(true)
        }

        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowContentAccess = true
            allowFileAccess = true
            cacheMode = WebSettings.LOAD_DEFAULT
            loadsImagesAutomatically = true
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            mediaPlaybackRequiresUserGesture = false
            userAgentString = "$userAgentString HoonStoreAndroid/1.0"
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                progressBar.visibility = if (newProgress >= 100) View.GONE else View.VISIBLE
                swipeRefresh.isRefreshing = false
            }

            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread {
                    val needsCamera = request.resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)

                    if (!needsCamera) {
                        request.grant(request.resources)
                        return@runOnUiThread
                    }

                    if (hasCameraPermission()) {
                        grantWebPermissions(request)
                        return@runOnUiThread
                    }

                    pendingPermissionRequest?.deny()
                    pendingPermissionRequest = request
                    permissionLauncher.launch(Manifest.permission.CAMERA)
                }
            }

            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                fileChooserCallback?.onReceiveValue(null)
                fileChooserCallback = filePathCallback

                val chooserIntent = buildFileChooserIntent(fileChooserParams)
                if (chooserIntent == null) {
                    fileChooserCallback?.onReceiveValue(null)
                    fileChooserCallback = null
                    Toast.makeText(
                        this@MainActivity,
                        R.string.file_picker_unavailable,
                        Toast.LENGTH_SHORT
                    ).show()
                    return false
                }

                return try {
                    fileChooserLauncher.launch(chooserIntent)
                    true
                } catch (_: ActivityNotFoundException) {
                    fileChooserCallback?.onReceiveValue(null)
                    fileChooserCallback = null
                    Toast.makeText(
                        this@MainActivity,
                        R.string.file_picker_unavailable,
                        Toast.LENGTH_SHORT
                    ).show()
                    false
                }
            }
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean {
                val targetUri = request?.url ?: return false
                return handleUrl(targetUri)
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                swipeRefresh.isRefreshing = false
                hideErrorState()
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                super.onReceivedError(view, request, error)

                if (request?.isForMainFrame == true) {
                    showErrorState(
                        getString(R.string.web_error_title),
                        error?.description?.toString()?.takeIf { it.isNotBlank() }
                            ?: getString(R.string.web_error_message)
                    )
                }
            }
        }
    }

    private fun handleUrl(uri: Uri): Boolean {
        val scheme = uri.scheme?.lowercase(Locale.ROOT).orEmpty()
        val host = uri.host?.lowercase(Locale.ROOT).orEmpty()

        if (host == "wa.me" || host == "api.whatsapp.com" || scheme == "whatsapp") {
            openExternalUrl(uri.toString())
            return true
        }

        return when (scheme) {
            "http", "https" -> false
            "mailto", "tel", "sms", "geo", "intent" -> {
                openExternalUrl(uri.toString())
                true
            }
            else -> {
                openExternalUrl(uri.toString())
                true
            }
        }
    }

    private fun openExternalUrl(url: String) {
        try {
            val intent = if (url.startsWith("intent://")) {
                Intent.parseUri(url, Intent.URI_INTENT_SCHEME)
            } else {
                Intent(Intent.ACTION_VIEW, Uri.parse(url))
            }.apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }

            startActivity(intent)
        } catch (_: Exception) {
            Toast.makeText(this, R.string.external_open_failed, Toast.LENGTH_SHORT).show()
        }
    }

    private fun hasCameraPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.CAMERA
        ) == PackageManager.PERMISSION_GRANTED
    }

    private fun handleCameraPermissionResult(granted: Boolean) {
        val request = pendingPermissionRequest ?: return
        pendingPermissionRequest = null

        if (!granted) {
            request.deny()
            Toast.makeText(this, R.string.camera_permission_required, Toast.LENGTH_SHORT).show()
            return
        }

        grantWebPermissions(request)
    }

    private fun grantWebPermissions(request: PermissionRequest) {
        val grantedResources = request.resources.filter {
            it == PermissionRequest.RESOURCE_VIDEO_CAPTURE
        }.toTypedArray()

        if (grantedResources.isEmpty()) {
            request.deny()
            return
        }

        request.grant(grantedResources)
    }

    private fun buildFileChooserIntent(
        params: WebChromeClient.FileChooserParams?
    ): Intent? {
        val contentIntent = Intent(Intent.ACTION_GET_CONTENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = resolveMimeType(params?.acceptTypes)
            putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params?.mode == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE)
        }

        val initialIntents = mutableListOf<Intent>()
        if (shouldOfferCamera(params?.acceptTypes)) {
            createCameraIntent()?.let(initialIntents::add)
        }

        return Intent(Intent.ACTION_CHOOSER).apply {
            putExtra(Intent.EXTRA_INTENT, contentIntent)
            putExtra(Intent.EXTRA_TITLE, getString(R.string.file_chooser_title))
            putExtra(Intent.EXTRA_INITIAL_INTENTS, initialIntents.toTypedArray())
        }
    }

    private fun resolveMimeType(acceptTypes: Array<String>?): String {
        val normalizedTypes = acceptTypes
            ?.map { it.trim() }
            ?.filter { it.isNotEmpty() }
            .orEmpty()

        if (normalizedTypes.any { it.startsWith("image/") || it == "image/*" }) {
            return "image/*"
        }

        return normalizedTypes.firstOrNull() ?: "*/*"
    }

    private fun shouldOfferCamera(acceptTypes: Array<String>?): Boolean {
        val normalizedTypes = acceptTypes
            ?.map { it.trim().lowercase(Locale.ROOT) }
            ?.filter { it.isNotEmpty() }
            .orEmpty()

        return normalizedTypes.isEmpty() || normalizedTypes.any {
            it == "*/*" || it == "image/*" || it.startsWith("image/")
        }
    }

    private fun createCameraIntent(): Intent? {
        val captureIntent = Intent(MediaStore.ACTION_IMAGE_CAPTURE)
        val imageFile = try {
            createTemporaryImageFile()
        } catch (_: IOException) {
            null
        } ?: return null

        cameraImageUri = FileProvider.getUriForFile(
            this,
            "${BuildConfig.APPLICATION_ID}.fileprovider",
            imageFile
        )

        captureIntent.putExtra(MediaStore.EXTRA_OUTPUT, cameraImageUri)
        captureIntent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
        captureIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)

        return captureIntent.takeIf {
            it.resolveActivity(packageManager) != null
        }
    }

    @Throws(IOException::class)
    private fun createTemporaryImageFile(): File {
        val timestamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())
        return File.createTempFile("HOON_${timestamp}_", ".jpg", cacheDir)
    }

    private fun showErrorState(title: String, message: String) {
        errorTitle.text = title
        errorMessage.text = message
        errorView.visibility = View.VISIBLE
        webView.visibility = View.INVISIBLE
        progressBar.visibility = View.GONE
        swipeRefresh.isRefreshing = false
    }

    private fun hideErrorState() {
        errorView.visibility = View.GONE
        webView.visibility = View.VISIBLE
    }
}
