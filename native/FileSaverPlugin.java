package id.tapak.patroli;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * "Simpan sebagai" lewat Storage Access Framework (ACTION_CREATE_DOCUMENT).
 * Pengguna memilih sendiri folder dan nama berkas di HP; tidak butuh izin penyimpanan.
 * JS lebih dulu menulis berkas ke cache aplikasi (Filesystem), lalu memanggil save({path,name,mime})
 * sehingga data besar (foto) tidak lewat jembatan Capacitor dua kali.
 */
@CapacitorPlugin(name = "FileSaver")
public class FileSaverPlugin extends Plugin {

    @PluginMethod
    public void save(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.isEmpty()) {
            call.reject("path kosong");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(call.getString("mime", "application/octet-stream"));
        intent.putExtra(Intent.EXTRA_TITLE, call.getString("name", "tapak.dat"));
        startActivityForResult(call, intent, "onSaved");
    }

    @ActivityCallback
    private void onSaved(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            call.reject("Dibatalkan", "CANCELLED");
            return;
        }
        final Uri dest = data.getData();
        final String src = call.getString("path");
        new Thread(() -> {
            try {
                String p = Uri.parse(src).getPath();
                File f = new File(p != null ? p : src);
                try (InputStream in = new FileInputStream(f);
                     OutputStream out = getContext().getContentResolver().openOutputStream(dest, "w")) {
                    if (out == null) throw new Exception("Tidak bisa membuka tujuan");
                    byte[] buf = new byte[64 * 1024];
                    int n;
                    while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                    out.flush();
                }
                JSObject ret = new JSObject();
                ret.put("uri", dest.toString());
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Gagal menyimpan: " + e.getMessage());
            }
        }).start();
    }
}
