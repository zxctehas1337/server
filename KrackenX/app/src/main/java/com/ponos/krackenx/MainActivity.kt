package com.ponos.krackenx

import android.os.Bundle
import android.view.Menu
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import com.google.android.material.snackbar.Snackbar
import com.google.android.material.navigation.NavigationView
import androidx.navigation.findNavController
import androidx.navigation.ui.AppBarConfiguration
import androidx.navigation.ui.navigateUp
import androidx.navigation.ui.setupActionBarWithNavController
import androidx.navigation.ui.setupWithNavController
import androidx.drawerlayout.widget.DrawerLayout
import androidx.appcompat.app.AppCompatActivity
import com.ponos.krackenx.databinding.ActivityMainBinding

class MainActivity : AppCompatActivity() {

    private lateinit var appBarConfiguration: AppBarConfiguration
    private lateinit var binding: ActivityMainBinding
    private var webView: WebView? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setSupportActionBar(binding.appBarMain.toolbar)

        // Hide FAB as we use WebView UI
        binding.appBarMain.fab.hide()

        // Initialize WebView
        webView = findViewById(R.id.webview)
        initializeWebView()
    }

    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        // Inflate the menu; this adds items to the action bar if it is present.
        menuInflater.inflate(R.menu.main, menu)
        return true
    }

    override fun onSupportNavigateUp(): Boolean {
        // If WebView can go back, navigate within WebView
        webView?.let {
            if (it.canGoBack()) {
                it.goBack()
                return true
            }
        }
        return super.onSupportNavigateUp()
    }

    override fun onBackPressed() {
        webView?.let {
            if (it.canGoBack()) {
                it.goBack()
                return
            }
        }
        super.onBackPressed()
    }

    private fun initializeWebView() {
        val wv = webView ?: return
        val settings: WebSettings = wv.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.loadsImagesAutomatically = true
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
        settings.cacheMode = WebSettings.LOAD_DEFAULT
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true

        wv.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean {
                return false
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                injectAndroidInviteHider()
            }
        }
        wv.webChromeClient = WebChromeClient()

        val baseUrl = getString(R.string.web_app_url)
        wv.loadUrl(baseUrl)

        // Force dark theme on first load for Android WebView
        wv.postDelayed({
            wv.evaluateJavascript(
                """
                try {
                  (function(){
                    var doc = document.documentElement;
                    if (doc && doc.setAttribute) {
                      doc.setAttribute('data-theme','dark');
                      try { localStorage.setItem('theme','dark'); } catch(e) {}
                    }
                  })();
                } catch(e) {}
                """.trimIndent()
            ) { _ -> }
        }, 500)
    }

    private fun injectAndroidInviteHider() {
        val wv = webView ?: return
        wv.evaluateJavascript(
            (
                """
                (function(){
                  try {
                    var css = '.invitation-notification{display:none!important}';
                    var style = document.getElementById('androidHideInviteStyle');
                    if(!style){
                      style = document.createElement('style');
                      style.id = 'androidHideInviteStyle';
                      style.type = 'text/css';
                      style.appendChild(document.createTextNode(css));
                      (document.head||document.documentElement).appendChild(style);
                    } else {
                      style.textContent = css;
                    }

                    var n = document.getElementById('invitationNotification');
                    if(n && n.parentNode){ n.parentNode.removeChild(n); }
                  } catch(e) {}
                })();
                """
                ).trimIndent(),
            null
        )
    }


}