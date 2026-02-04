local function get_lazy_path(plugin)
  local lazypath = vim.fn.stdpath("data") .. "/lazy/"
  return lazypath .. plugin .. "/lua/"
end
---@type vim.lsp.Config
return {
  cmd = { "lua-language-server" },
  filetypes = { "lua" },
  root_markers = {
    ".emmyrc.json",
    ".luarc.json",
    ".luarc.jsonc",
    ".luacheckrc",
    ".stylua.toml",
    "stylua.toml",
    "selene.toml",
    "selene.yml",
    ".git",
  },
  settings = {
    Lua = {
      codeLens = { enable = true },
      hint = {
        enable = true,
        arrayIndex = "Disable",
        semicolon = "Disable",
      },
      runtime = {
        version = "LuaJIT",
      },
      workspace = {
        checkThirdParty = false,
        library = {
          vim.env.VIMRUNTIME,
          "${3rd}/luv/library",
          get_lazy_path("blink.cmp"),
          get_lazy_path("mini.ai"),
          get_lazy_path("mini.extra"),
          get_lazy_path("mini.files"),
          get_lazy_path("mini.move"),
          get_lazy_path("mini.pairs"),
          get_lazy_path("mini.pick"),
        },
      },
    },
  },
}
