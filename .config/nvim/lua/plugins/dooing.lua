return {
  "atiladefreitas/dooing",
  config = function()
    require("dooing").setup({
      window = {
        width = 75,
        height = 20,
        border = "single",
        position = "center",
      },
      -- your custom config here (optional)
    })
  end,
}
