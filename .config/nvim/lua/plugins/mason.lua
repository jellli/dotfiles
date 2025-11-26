local mason_bin = vim.fn.expand("~/.local/share/nvim/mason/bin")
vim.env.PATH = mason_bin .. ":" .. vim.env.PATH

return {
  "mason-org/mason.nvim",
  cmd = "Mason",
  build = ":MasonUpdate",
  opts_extend = { "ensure_installed" },
  opts = {
    ensure_installed = {
      -- "rust-analyzer",

      "cssmodules-language-server",
      "css-lsp",
      -- "tailwindcss-language-server",
      "emmet-ls",
      "biome",
      "vtsls",

      "stylua",
      "lua-language-server",
    },
  },
  --@param opts MasonSettings | {ensure_installed: string[]}
  config = function(_, opts)
    require("mason").setup(opts)
    local mr = require("mason-registry")

    mr.refresh(function()
      for _, tool in ipairs(opts.ensure_installed) do
        local p = mr.get_package(tool)
        if not p:is_installed() then
          p:install()
        end
      end
    end)
  end,
}
