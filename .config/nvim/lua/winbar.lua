Winbar = {}
H = {}

function H.hl(hl_name, text)
  return string.format("%%#%s#%s%%*", hl_name, text)
end

Winbar.render = function(bufnr)
  local filepath = vim.api.nvim_buf_get_name(bufnr)
  local filename = vim.fn.fnamemodify(filepath, ":t")
  local ext = vim.fn.fnamemodify(filepath, ":e")
  local icon, hl = require("nvim-web-devicons").get_icon(filename, ext, { default = true })
  local icon_hl = H.hl(hl, icon)
  local modified = vim.bo[bufnr].modified
  local filename_hl = H.hl(modified and "Added" or "Title", filename .. (modified and "*" or ""))
  return table.concat({
    "%=",
    " ",
    icon_hl,
    " ",
    filename_hl,
  })
end

vim.api.nvim_create_autocmd({ "BufEnter", "BufModifiedSet" }, {
  group = vim.api.nvim_create_augroup("j/winbar", { clear = true }),
  callback = function(event)
    vim.wo.winbar = Winbar.render(event.buf)
  end,
})
