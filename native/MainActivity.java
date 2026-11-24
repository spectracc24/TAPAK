package id.tapak.patroli;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // plugin lokal harus didaftarkan sebelum super.onCreate
        registerPlugin(FileSaverPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
