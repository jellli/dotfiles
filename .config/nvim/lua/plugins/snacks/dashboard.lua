local function get_version()
  local version = vim.version()
  local version_str = string.format(
    "v%d.%d.%d (%s)",
    version.major,
    version.minor,
    version.patch,
    version.prerelease and "Nightly" or "Stable"
  )

  return version_str
end
--- @type snacks.dashboard.Opts
return {
  enabled = true,
  preset = {
    header = [[
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠳⣶⡤⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠠⣾⣦⡀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣈⣻⡧⢀⠀⠀
⢷⣦⣤⡀⠀⢀⣠⣤⡆⢰⣶⣶⣾⣿⣿⣷⣕⣡⡀
⠘⣿⣿⠇⠀⣦⡀⠉⠉⠈⠉⠁⢸⣿⣿⣿⣿⡿⠃
⠀⠀⠀⣀⣴⣿⣿⣄⣀⣀⣀⢀⣼⣿⣿⣿⠁⠀⠀
⠀⠀⠀⠀⠉⢩⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡀⠀⠀
⠀⠀⠀⠀⠀⣸⣿⣿⡿⢻⣿⣿⣿⣿⡿⢿⠇⠀⠀
⠀⠀⠀⠀⢰⣿⣿⣿⠰⠙⠁⠈⣿⣿⠱⠘⠀⠀⠀
⠀⠀⠀⠀⢸⡏⣾⡿⠁⠀⠀⠀⢿⣼⣷⠁⠀⠀⠀
⠀⠀⠀⠀⠘⠷⢿⣧⡀⠀⠀⠀⠈⠛⢿⣆⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠉⠉⠀⠀⠀⠀⠀⠀⠈⠀⠀⠀
    ]],
  },
  sections = {
    { section = "header", padding = 1, height = 2 },
    { title = "Recent Files", section = "recent_files", cwd = true, indent = 2, padding = 1 },
    { text = { { get_version(), hl = "Special" } }, padding = 1, height = 2, align = "center" },
  },
  formats = {},
}
