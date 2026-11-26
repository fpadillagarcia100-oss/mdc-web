using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;

namespace Mdc.Api;

/// <summary>
/// Crear, arrancar y detener el servicio de Windows llamando directo al
/// Administrador de servicios (advapi32), sin pasar por sc.exe.
///
/// Con sc.exe la instalación se quedó colgada: cuando algo de la línea de
/// comandos no le cuadra, imprime la ayuda y PREGUNTA "¿ver más ayuda? [y/n]"
/// — con la salida redirigida nadie ve la pregunta y espera para siempre.
/// Aquí cada dato va en su parámetro: no hay texto que interpretar ni nada
/// que pueda quedarse esperando una tecla.
/// </summary>
[SupportedOSPlatform("windows")]
public static class ServicioWindows
{
    private const uint SC_MANAGER_ALL_ACCESS = 0xF003F;
    private const uint SERVICE_ALL_ACCESS = 0xF01FF;
    private const uint SERVICE_WIN32_OWN_PROCESS = 0x10;
    private const uint SERVICE_AUTO_START = 0x2;
    private const uint SERVICE_ERROR_NORMAL = 0x1;
    private const uint SERVICE_CONFIG_DESCRIPTION = 1;
    private const uint SERVICE_CONFIG_FAILURE_ACTIONS = 2;
    private const uint SERVICE_CONFIG_DELAYED_AUTO_START_INFO = 3;
    private const uint SERVICE_CONTROL_STOP = 0x1;
    private const uint SERVICE_STOPPED = 0x1;
    private const int ERROR_SERVICE_DOES_NOT_EXIST = 1060;
    private const int ERROR_SERVICE_ALREADY_RUNNING = 1056;
    private const int ERROR_SERVICE_NOT_ACTIVE = 1062;
    private const int SC_ACTION_RESTART = 1;

    [StructLayout(LayoutKind.Sequential)]
    private struct SERVICE_STATUS
    {
        public uint dwServiceType, dwCurrentState, dwControlsAccepted, dwWin32ExitCode,
                    dwServiceSpecificExitCode, dwCheckPoint, dwWaitHint;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct SERVICE_DESCRIPTION { public string lpDescription; }

    [StructLayout(LayoutKind.Sequential)]
    private struct SERVICE_DELAYED_AUTO_START_INFO { public int fDelayedAutostart; }

    [StructLayout(LayoutKind.Sequential)]
    private struct SC_ACTION { public int Type; public uint Delay; }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct SERVICE_FAILURE_ACTIONS
    {
        public uint dwResetPeriod;
        public string? lpRebootMsg, lpCommand;
        public uint cActions;
        public IntPtr lpsaActions;
    }

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern IntPtr OpenSCManagerW(string? maquina, string? baseDatos, uint acceso);

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern IntPtr OpenServiceW(IntPtr scm, string nombre, uint acceso);

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern IntPtr CreateServiceW(IntPtr scm, string nombre, string nombreVisible, uint acceso,
        uint tipo, uint inicio, uint control, string ruta, string? grupo, IntPtr etiqueta,
        string? dependencias, string? cuenta, string? contrasena);

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool ChangeServiceConfig2W(IntPtr servicio, uint nivel, IntPtr info);

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool StartServiceW(IntPtr servicio, uint nArgs, IntPtr args);

    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern bool ControlService(IntPtr servicio, uint control, out SERVICE_STATUS estado);

    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern bool QueryServiceStatus(IntPtr servicio, out SERVICE_STATUS estado);

    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern bool CloseServiceHandle(IntPtr h);

    private static IntPtr Administrador()
    {
        var scm = OpenSCManagerW(null, null, SC_MANAGER_ALL_ACCESS);
        return scm != IntPtr.Zero ? scm : throw new Win32Exception(Marshal.GetLastWin32Error(), "No se pudo abrir el Administrador de servicios");
    }

    public static bool Existe(string nombre)
    {
        var scm = Administrador();
        try
        {
            var s = OpenServiceW(scm, nombre, SERVICE_ALL_ACCESS);
            if (s == IntPtr.Zero)
            {
                var e = Marshal.GetLastWin32Error();
                return e == ERROR_SERVICE_DOES_NOT_EXIST ? false : throw new Win32Exception(e);
            }
            CloseServiceHandle(s);
            return true;
        }
        finally { CloseServiceHandle(scm); }
    }

    /// <summary>
    /// Crea el servicio: arranque automático retrasado, cuenta virtual, y que
    /// se levante solo si se cae (5 s, 30 s, y luego cada minuto).
    /// </summary>
    public static void Crear(string nombre, string nombreVisible, string descripcion, string ejecutable, string cuenta)
    {
        var scm = Administrador();
        try
        {
            /* La ruta va ENTRE COMILLAS: lleva espacios ("Program Files"), y sin
               comillas Windows probaría primero C:\Program.exe — la clásica
               "ruta de servicio sin entrecomillar". Una cuenta virtual
               (NT SERVICE\…) no lleva contraseña. */
            var s = CreateServiceW(scm, nombre, nombreVisible, SERVICE_ALL_ACCESS, SERVICE_WIN32_OWN_PROCESS,
                SERVICE_AUTO_START, SERVICE_ERROR_NORMAL, $"\"{ejecutable}\"", null, IntPtr.Zero, null, cuenta, null);
            if (s == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error(), "No se pudo crear el servicio");
            try
            {
                Configurar(s, SERVICE_CONFIG_DESCRIPTION, new SERVICE_DESCRIPTION { lpDescription = descripcion });
                Configurar(s, SERVICE_CONFIG_DELAYED_AUTO_START_INFO, new SERVICE_DELAYED_AUTO_START_INFO { fDelayedAutostart = 1 });

                var acciones = new[]
                {
                    new SC_ACTION { Type = SC_ACTION_RESTART, Delay = 5_000 },
                    new SC_ACTION { Type = SC_ACTION_RESTART, Delay = 30_000 },
                    new SC_ACTION { Type = SC_ACTION_RESTART, Delay = 60_000 },
                };
                var tam = Marshal.SizeOf<SC_ACTION>();
                var buffer = Marshal.AllocHGlobal(tam * acciones.Length);
                try
                {
                    for (var i = 0; i < acciones.Length; i++) Marshal.StructureToPtr(acciones[i], buffer + i * tam, false);
                    Configurar(s, SERVICE_CONFIG_FAILURE_ACTIONS, new SERVICE_FAILURE_ACTIONS
                    {
                        dwResetPeriod = 86_400, cActions = (uint)acciones.Length, lpsaActions = buffer,
                    });
                }
                finally { Marshal.FreeHGlobal(buffer); }
            }
            finally { CloseServiceHandle(s); }
        }
        finally { CloseServiceHandle(scm); }
    }

    public static void Arrancar(string nombre) => ConServicio(nombre, s =>
    {
        if (!StartServiceW(s, 0, IntPtr.Zero) && Marshal.GetLastWin32Error() is var e && e != ERROR_SERVICE_ALREADY_RUNNING)
            throw new Win32Exception(e, "No se pudo arrancar el servicio");
    });

    /// <summary>Lo detiene y espera a que esté detenido (hasta 30 s).</summary>
    public static void Detener(string nombre) => ConServicio(nombre, s =>
    {
        if (!ControlService(s, SERVICE_CONTROL_STOP, out _) && Marshal.GetLastWin32Error() is var e && e != ERROR_SERVICE_NOT_ACTIVE)
            throw new Win32Exception(e, "No se pudo detener el servicio");
        for (var i = 0; i < 30; i++)
        {
            if (QueryServiceStatus(s, out var estado) && estado.dwCurrentState == SERVICE_STOPPED) return;
            Thread.Sleep(1000);
        }
        throw new InvalidOperationException("El servicio no se detuvo a tiempo para actualizarlo.");
    });

    private static void ConServicio(string nombre, Action<IntPtr> accion)
    {
        var scm = Administrador();
        try
        {
            var s = OpenServiceW(scm, nombre, SERVICE_ALL_ACCESS);
            if (s == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error(), $"No se encontró el servicio {nombre}");
            try { accion(s); } finally { CloseServiceHandle(s); }
        }
        finally { CloseServiceHandle(scm); }
    }

    private static void Configurar<T>(IntPtr servicio, uint nivel, T info) where T : struct
    {
        var p = Marshal.AllocHGlobal(Marshal.SizeOf<T>());
        try
        {
            Marshal.StructureToPtr(info, p, false);
            if (!ChangeServiceConfig2W(servicio, nivel, p))
                throw new Win32Exception(Marshal.GetLastWin32Error(), "No se pudo configurar el servicio");
        }
        finally
        {
            Marshal.DestroyStructure<T>(p);
            Marshal.FreeHGlobal(p);
        }
    }
}
